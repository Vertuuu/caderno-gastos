"""Caderno de Gastos — painel para ligar, acompanhar e abrir o servidor local.

Dê dois cliques neste arquivo (precisa do Python e do Node.js instalados).
Só usa a biblioteca padrão do Python (tkinter incluso).
"""
import json
import os
import queue
import socket
import subprocess
import sys
import threading
import time
import tkinter as tk
import traceback
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from tkinter import messagebox

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "app" / "assets"
CONFIG = ROOT / "app" / "config.json"
ERROR_LOG = ROOT / "app" / "erro.log"
APP_NAME = "Caderno de Gastos"
APP_ID = "caderno-gastos"          # o que o /api/health responde em "app"
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


# ---------- Registro de erros ----------
# Com pythonw não existe console: sem isso, um erro ao abrir o painel some sem deixar rastro.
def log_error(where, text):
    try:
        ERROR_LOG.parent.mkdir(parents=True, exist_ok=True)
        if ERROR_LOG.exists() and ERROR_LOG.stat().st_size > 200_000:   # guarda só o final
            ERROR_LOG.write_text(ERROR_LOG.read_text(encoding="utf-8", errors="replace")[-100_000:], encoding="utf-8")
        with ERROR_LOG.open("a", encoding="utf-8") as f:
            f.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] {where}\n{text.rstrip()}\n")
    except OSError:
        pass


def native_alert(text):
    """Aviso do Windows que funciona mesmo quando o Tk não abriu."""
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, text, APP_NAME, 0x10)
    except Exception:
        pass

# Paletas iguais às do site (tema claro e escuro)
PALETTES = {
    "light": {
        "brand": "#17223f", "brand_ink": "#ffffff", "brand_sub": "#b9c3dc", "brand_btn": "#22305a",
        "bg": "#eceff5", "card": "#ffffff", "ink": "#141a2b", "muted": "#586179", "line": "#d3d9e6",
        "green": "#17855a", "green_ink": "#ffffff", "red": "#d03b2a", "amber": "#b86a00",
        "gray_soft": "#e6e9f1", "focus": "#2f5bd3", "log_bg": "#0e1220", "log_fg": "#cfd6e8",
    },
    "dark": {
        "brand": "#0a0f1e", "brand_ink": "#e6e9f3", "brand_sub": "#8f9ab5", "brand_btn": "#1c2440",
        "bg": "#0e1220", "card": "#171c2c", "ink": "#e6e9f3", "muted": "#9ca5bb", "line": "#283049",
        "green": "#1f9463", "green_ink": "#ffffff", "red": "#ff8a72", "amber": "#f2b544",
        "gray_soft": "#1f2638", "focus": "#86a5ff", "log_bg": "#080b15", "log_fg": "#cfd6e8",
    },
}
C = dict(PALETTES["light"])
FONT = "Segoe UI"


def windows_prefers_dark():
    """Lê a preferência de tema dos apps do Windows (Configurações > Personalização > Cores)."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as k:
            return winreg.QueryValueEx(k, "AppsUseLightTheme")[0] == 0
    except OSError:
        return False


def set_dark_titlebar(root, dark):
    """Barra de título escura no Windows 10/11 (ignora em sistemas sem suporte)."""
    try:
        import ctypes
        root.update_idletasks()
        hwnd = ctypes.windll.user32.GetParent(root.winfo_id())
        value = ctypes.c_int(1 if dark else 0)
        for attr in (20, 19):  # 20 = Windows 11 / 10 20H1+, 19 = versões antigas do 10
            if ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, attr, ctypes.byref(value), ctypes.sizeof(value)) == 0:
                break
        # força o Windows a redesenhar a barra
        if root.state() == "normal":
            root.withdraw(); root.deiconify()
    except Exception:
        pass


# ---------- Configuração ----------
CONFIG_DEFAULTS = {"port": 3000, "open_browser": True, "theme": "auto"}


def load_config():
    """Lê app/config.json. Arquivo ausente, quebrado ou com valor inválido: vale o padrão daquele item."""
    cfg = dict(CONFIG_DEFAULTS)
    try:
        raw = json.loads(CONFIG.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return cfg
    if not isinstance(raw, dict):
        return cfg
    port = raw.get("port")
    if isinstance(port, int) and not isinstance(port, bool) and 1 <= port <= 65535:
        cfg["port"] = port
    if isinstance(raw.get("open_browser"), bool):
        cfg["open_browser"] = raw["open_browser"]
    if raw.get("theme") in ("light", "dark", "auto"):
        cfg["theme"] = raw["theme"]
    return cfg


def save_config(cfg):
    try:
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        CONFIG.write_text(json.dumps(cfg, indent=2), encoding="utf-8")
    except OSError:
        pass


# ---------- Rede ----------
def private_rank(ip):
    """0 = 192.168.x, 1 = 10.x, 2 = 172.16–31.x (faixas de rede local); 3 = o resto (VPN, CGNAT…)."""
    try:
        a, b = (int(x) for x in ip.split(".")[:2])
    except ValueError:
        return 3
    if a == 192 and b == 168:
        return 0
    if a == 10:
        return 1
    if a == 172 and 16 <= b <= 31:
        return 2
    return 3


def order_addresses(ips, route=None):
    """Ordena os IPs para o celular: primeiro o da rota de saída (a placa que acessa a internet, quase sempre
    o Wi-Fi ou o cabo) se for de rede local; depois as faixas de rede local; VPNs e afins por último.
    Assim um 172.x do WSL/Hyper-V ou um 10.x de VPN não aparecem no lugar do Wi-Fi."""
    ips = {ip for ip in ips if ip and not ip.startswith(("127.", "169.254.", "0."))}
    if route and route.startswith(("127.", "169.254.", "0.")):
        route = None
    return sorted(ips, key=lambda ip: (0 if ip == route and private_rank(ip) < 3 else 1, private_rank(ip), ip))


def lan_addresses():
    ips, route = set(), None
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:  # descobre o IP da interface de saída (sem enviar nada)
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            route = s.getsockname()[0]
            ips.add(route)
    except OSError:
        pass
    return order_addresses(ips, route)


def server_info(port, timeout=0.8):
    """Resposta do /api/health se for o Caderno de Gastos; {} para um Caderno antigo, sem essa rota;
    None se nada responde ou se a porta é de outro programa."""
    base = f"http://127.0.0.1:{port}"
    try:
        with urllib.request.urlopen(f"{base}/api/health", timeout=timeout) as r:
            d = json.loads(r.read() or b"{}")
            return d if isinstance(d, dict) and d.get("app") == APP_ID else None
    except urllib.error.HTTPError as e:
        if e.code != 404:
            return None
    except Exception:
        return None
    try:  # servidor de antes do /api/health (ex.: iniciar.bat de uma cópia antiga)
        with urllib.request.urlopen(f"{base}/api/data?rev=-2", timeout=timeout) as r:
            return {} if r.status == 200 else None
    except Exception:
        return None


def request_shutdown(port):
    """Pede ao servidor para gravar e sair (só é aceito do próprio computador)."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/shutdown", method="POST", data=b"")
        urllib.request.urlopen(req, timeout=2).read()
        return True
    except Exception:
        return False


def port_busy(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def find_node():
    from shutil import which
    found = which("node")
    if found:
        return found
    for p in (Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "nodejs" / "node.exe",
              Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "nodejs" / "node.exe"):
        if p.exists():
            return str(p)
    return None


# ---------- Atalhos do Windows ----------
def pythonw():
    exe = Path(sys.executable)
    cand = exe.with_name("pythonw.exe")
    return str(cand if cand.exists() else exe)


def shortcut_args(extra_args=""):
    return f'"{Path(__file__).resolve()}" {extra_args}'.strip()


def run_powershell(script, env):
    """Roda um comando do PowerShell com saída em UTF-8 (sem perder acentos) e devolve o stdout.
    Em caso de erro, a exceção traz a mensagem do próprio PowerShell."""
    ps = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;$ErrorActionPreference='Stop';" + script
    out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps], env=dict(os.environ, **env),
                         creationflags=NO_WINDOW, capture_output=True, timeout=20)
    stdout = out.stdout.decode("utf-8", "replace").strip()
    if out.returncode != 0:
        err = out.stderr.decode("utf-8", "replace").strip() or stdout or f"código {out.returncode}"
        raise RuntimeError(err)
    return stdout


def make_shortcut(link_path, extra_args=""):
    run_powershell(
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);"
        "$s.TargetPath=$env:TGT;$s.Arguments=$env:ARGS;$s.WorkingDirectory=$env:WD;"
        "$s.IconLocation=$env:ICO;$s.Description='Abre o Caderno de Gastos';$s.Save()",
        {"LNK": str(link_path), "TGT": pythonw(), "ARGS": shortcut_args(extra_args), "WD": str(ROOT), "ICO": str(ASSETS / "icone.ico")})


def read_shortcut(link_path):
    """(programa, argumentos) de um atalho .lnk."""
    out = run_powershell("$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK);"
                         "Write-Output $s.TargetPath;Write-Output $s.Arguments", {"LNK": str(link_path)})
    lines = out.splitlines() + ["", ""]
    return lines[0].strip(), lines[1].strip()


def desktop_dir():
    """Pasta da Área de Trabalho pelo registro do Windows (vale também quando o OneDrive a moveu,
    como em "OneDrive\\Área de Trabalho")."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as k:
            p = Path(os.path.expandvars(winreg.QueryValueEx(k, "Desktop")[0]))
        if p.is_dir():
            return p
    except (OSError, ImportError):
        pass
    return Path.home() / "Desktop"


STARTUP_LNK = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / f"{APP_NAME}.lnk"


# ---------- App ----------
class App:
    def __init__(self, root, start_minimized=False):
        self.root = root
        self.cfg = load_config()
        self.port = int(self.cfg.get("port", 3000))
        self.proc = None
        self.owned = False          # o servidor foi aberto por este app?
        self.state = "parado"
        # Fila única entre as threads e a janela: linhas do registro (str) ou funções a rodar na thread do Tk.
        # Só a thread principal mexe na tela (o Tkinter não garante chamadas vindas de outras threads).
        self.logq = queue.Queue()
        self.gen = 0                # muda a cada ligar/desligar: descarta respostas de checagens antigas
        self.ips = []               # IPs da rede, descobertos fora da thread da janela
        self.checking = False
        self.opened_once = False
        self.start_minimized = start_minimized

        root.title(APP_NAME)
        root.configure(bg=C["bg"])
        root.resizable(False, False)
        try:
            root.iconbitmap(default=str(ASSETS / "icone.ico"))
        except tk.TclError:
            pass
        self.icon64 = tk.PhotoImage(file=str(ASSETS / "icone-64.png"))
        root.iconphoto(True, self.icon64)
        root.protocol("WM_DELETE_WINDOW", self.on_close)

        self.status_text = ""
        self.log_lines = []
        self.log_open = False
        self.theme_mode = self.cfg.get("theme", "auto")   # "light" | "dark" | "auto" (igual ao Windows)
        self.dark = None
        self.apply_theme(first=True)
        self.root.after(100, self.boot)
        self.root.after(200, self.pump_log)
        self.root.after(4000, self.follow_system_theme)

    # ----- tema -----
    def resolved_dark(self):
        return self.theme_mode == "dark" or (self.theme_mode == "auto" and windows_prefers_dark())

    def apply_theme(self, first=False):
        dark = self.resolved_dark()
        C.clear(); C.update(PALETTES["dark" if dark else "light"])
        self.dark = dark
        for w in self.root.winfo_children():
            w.destroy()
        self.root.configure(bg=C["bg"])
        self.build()
        if not first:
            self.set_status(self.state, self.status_text)
        set_dark_titlebar(self.root, dark)

    def set_theme(self, mode):
        self.theme_mode = mode
        self.cfg["theme"] = mode
        save_config(self.cfg)
        self.apply_theme()

    def follow_system_theme(self):
        """No modo "igual ao Windows", acompanha a troca de tema do sistema sem reabrir o app."""
        if self.theme_mode == "auto" and self.resolved_dark() != self.dark:
            self.apply_theme()
        self.root.after(4000, self.follow_system_theme)

    # ----- interface -----
    def build(self):
        r = self.root
        head = tk.Frame(r, bg=C["brand"], padx=20, pady=16)
        head.pack(fill="x")
        tk.Label(head, image=self.icon64, bg=C["brand"]).pack(side="left")
        txt = tk.Frame(head, bg=C["brand"])
        txt.pack(side="left", padx=14)
        tk.Label(txt, text=APP_NAME, font=(FONT, 17, "bold"), fg=C["brand_ink"], bg=C["brand"]).pack(anchor="w")
        tk.Label(txt, text="Servidor local de controle de gastos", font=(FONT, 10), fg=C["brand_sub"], bg=C["brand"]).pack(anchor="w")

        # seletor de tema: claro / igual ao Windows / escuro
        seg = tk.Frame(head, bg=C["brand_btn"], padx=3, pady=3)
        seg.pack(side="right", anchor="n")
        for mode, glyph, tip in (("light", "☀", "Tema claro"), ("auto", "◐", "Igual ao Windows"), ("dark", "☾", "Tema escuro")):
            on = self.theme_mode == mode
            b = tk.Label(seg, text=glyph, font=("Segoe UI Symbol", 11), width=2, cursor="hand2",
                         bg=C["brand_sub"] if on else C["brand_btn"], fg=C["brand"] if on else C["brand_ink"])
            b.pack(side="left", padx=1)
            b.bind("<Button-1>", lambda e, m=mode: self.set_theme(m))
            b.bind("<Enter>", lambda e, t=tip: self.root.title(f"{APP_NAME} · {t}"))
            b.bind("<Leave>", lambda e: self.refresh_title())

        body = tk.Frame(r, bg=C["bg"], padx=20, pady=18)
        body.pack(fill="both")

        # cartão de status
        card = tk.Frame(body, bg=C["card"], highlightthickness=1, highlightbackground=C["line"], padx=18, pady=16)
        card.pack(fill="x")
        row = tk.Frame(card, bg=C["card"])
        row.pack(fill="x")
        self.dot = tk.Canvas(row, width=16, height=16, bg=C["card"], highlightthickness=0)
        self.dot.pack(side="left")
        self.dot_id = self.dot.create_oval(2, 2, 14, 14, fill=C["muted"], outline="")
        self.status_lbl = tk.Label(row, text="Verificando…", font=(FONT, 15, "bold"), fg=C["ink"], bg=C["card"])
        self.status_lbl.pack(side="left", padx=8)
        self.status_sub = tk.Label(card, text="", font=(FONT, 10), fg=C["muted"], bg=C["card"], justify="left", wraplength=380)
        self.status_sub.pack(anchor="w", pady=(4, 10))

        self.addr_box = tk.Frame(card, bg=C["card"])
        self.addr_box.pack(fill="x")

        # botões principais
        btns = tk.Frame(body, bg=C["bg"])
        btns.pack(fill="x", pady=(14, 0))
        self.open_btn = self.button(btns, "Abrir no navegador", self.open_browser, primary=True)
        self.open_btn.pack(side="left", fill="x", expand=True)
        self.toggle_btn = self.button(btns, "Desligar", self.toggle)
        self.toggle_btn.pack(side="left", padx=(10, 0))

        # opções
        opts = tk.Frame(body, bg=C["bg"])
        opts.pack(fill="x", pady=(16, 0))
        self.var_open = tk.BooleanVar(value=bool(self.cfg.get("open_browser", True)))
        self.var_startup = tk.BooleanVar(value=STARTUP_LNK.exists())
        self.check(opts, "Abrir o navegador quando o servidor ligar", self.var_open, self.on_open_pref).pack(anchor="w")
        self.check(opts, "Ligar junto com o Windows (minimizado)", self.var_startup, self.on_startup_pref).pack(anchor="w", pady=(2, 0))

        foot = tk.Frame(body, bg=C["bg"])
        foot.pack(fill="x", pady=(12, 0))
        self.link(foot, "Criar atalho na Área de Trabalho", self.desktop_shortcut).pack(side="left")
        self.log_link = self.link(foot, "Ver registro ▾", self.toggle_log)
        self.log_link.pack(side="right")

        self.log_frame = tk.Frame(body, bg=C["bg"])
        self.log = tk.Text(self.log_frame, height=9, width=56, font=("Consolas", 9), bg=C["log_bg"], fg=C["log_fg"],
                           relief="flat", padx=10, pady=8, wrap="word", highlightthickness=1, highlightbackground=C["line"])
        self.log.insert("end", "".join(self.log_lines))
        self.log.see("end")
        self.log.configure(state="disabled")
        self.log.pack(fill="both")
        if self.log_open:
            self.log_frame.pack(fill="both", pady=(10, 0))
            self.log_link.configure(text="Ocultar registro ▴")

    def button(self, parent, text, cmd, primary=False):
        bg, fg = (C["green"], C["green_ink"]) if primary else (C["card"], C["ink"])
        b = tk.Button(parent, text=text, command=cmd, font=(FONT, 11, "bold"), bg=bg, fg=fg,
                      activebackground=bg, activeforeground=fg, relief="flat", bd=0, padx=16, pady=9, cursor="hand2",
                      highlightthickness=0 if primary else 1, highlightbackground=C["line"])
        return b

    def check(self, parent, text, var, cmd):
        return tk.Checkbutton(parent, text=text, variable=var, command=cmd, font=(FONT, 10), bg=C["bg"], fg=C["ink"],
                              activebackground=C["bg"], activeforeground=C["ink"], selectcolor=C["card"],
                              cursor="hand2", anchor="w", highlightthickness=0)

    def link(self, parent, text, cmd):
        l = tk.Label(parent, text=text, font=(FONT, 10, "underline"), fg=C["focus"], bg=C["bg"], cursor="hand2")
        l.bind("<Button-1>", lambda e: cmd())
        return l

    def render_addresses(self, active):
        for w in self.addr_box.winfo_children():
            w.destroy()
        if not active:
            return
        rows = [("Neste computador", f"http://localhost:{self.port}")]
        ips = self.ips
        if ips:  # o primeiro é a rede de casa (192.168…, 10…); VPNs e afins ficam de fora
            rows.append(("Celular / outros aparelhos", f"http://{ips[0]}:{self.port}"))
        for label, url in rows:
            fr = tk.Frame(self.addr_box, bg=C["card"])
            fr.pack(fill="x", pady=2)
            tk.Label(fr, text=label, font=(FONT, 9), fg=C["muted"], bg=C["card"], width=22, anchor="w").pack(side="left")
            ent = tk.Entry(fr, font=("Consolas", 10), relief="flat", bg=C["gray_soft"], fg=C["ink"], width=26,
                           readonlybackground=C["gray_soft"])
            ent.insert(0, url)
            ent.configure(state="readonly")
            ent.pack(side="left", ipady=3, padx=(0, 6))
            cp = tk.Label(fr, text="Copiar", font=(FONT, 9, "underline"), fg=C["focus"], bg=C["card"], cursor="hand2")
            cp.bind("<Button-1>", lambda e, u=url, w=cp: self.copy(u, w))
            cp.pack(side="left")

    def copy(self, text, widget):
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        widget.configure(text="Copiado ✓")
        self.root.after(1500, lambda: widget.winfo_exists() and widget.configure(text="Copiar"))

    def set_status(self, state, sub=""):
        self.state = state
        look = {
            "ativo": ("Servidor ativo", C["green"]),
            "externo": ("Servidor ativo", C["green"]),
            "iniciando": ("Ligando…", C["amber"]),
            "parando": ("Desligando…", C["amber"]),
            "parado": ("Servidor desligado", C["muted"]),
            "erro": ("Não foi possível ligar", C["red"]),
        }[state]
        self.status_lbl.configure(text=look[0], fg=C["ink"] if state != "erro" else C["red"])
        self.dot.itemconfigure(self.dot_id, fill=look[1])
        self.status_sub.configure(text=sub)
        on = state in ("ativo", "externo")
        self.open_btn.configure(state="normal" if on else "disabled",
                                bg=C["green"] if on else C["gray_soft"], disabledforeground=C["muted"],
                                cursor="hand2" if on else "arrow")
        if on:
            self.toggle_btn.configure(text="Desligar", state="normal")
        elif state in ("parado", "erro"):
            self.toggle_btn.configure(text="Ligar", state="normal")
        else:
            self.toggle_btn.configure(state="disabled")
        self.toggle_btn.configure(disabledforeground=C["muted"])
        self.status_text = sub
        self.render_addresses(on)
        if on:
            self.refresh_ips()
        self.refresh_title()

    def refresh_title(self):
        on = self.state in ("ativo", "externo")
        names = {"iniciando": "ligando", "parando": "desligando", "parado": "desligado", "erro": "erro"}
        self.root.title(f"{APP_NAME} · {'ativo' if on else names.get(self.state, '')}")

    def write_log(self, line):
        self.log_lines.append(line.rstrip() + "\n")
        del self.log_lines[:-500]
        self.log.configure(state="normal")
        self.log.insert("end", line.rstrip() + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def pump_log(self):
        try:
            while True:
                item = self.logq.get_nowait()
                if isinstance(item, str):
                    self.write_log(item)
                else:
                    fn, args = item
                    try:
                        fn(*args)
                    except Exception:
                        self.root.report_callback_exception(*sys.exc_info())
        except queue.Empty:
            pass
        self.root.after(100, self.pump_log)

    def post(self, fn, *args):
        """Agenda fn(*args) na thread da janela (pode ser chamado de qualquer thread)."""
        self.logq.put((fn, args))

    def bg(self, work, then=None, *, gen=None):
        """Roda work() fora da janela e entrega o resultado a then() na thread da janela.
        Com gen, a resposta é descartada se o servidor foi ligado/desligado no meio do caminho."""
        def run():
            try:
                res = work()
            except Exception:
                log_error("Erro em segundo plano", traceback.format_exc())
                return
            if then:
                self.post(lambda: then(res) if gen is None or gen == self.gen else None)
        threading.Thread(target=run, daemon=True).start()

    def refresh_ips(self):
        def got(ips):
            if ips != self.ips:
                self.ips = ips
                self.render_addresses(self.state in ("ativo", "externo"))
        self.bg(lan_addresses, got)

    def toggle_log(self):
        self.log_open = not self.log_open
        if not self.log_open:
            self.log_frame.pack_forget()
            self.log_link.configure(text="Ver registro ▾")
        else:
            self.log_frame.pack(fill="both", pady=(10, 0))
            self.log_link.configure(text="Ocultar registro ▴")

    # ----- servidor -----
    # As checagens de rede rodam em threads (self.bg) para a janela não travar; as respostas voltam pela fila.
    def boot(self):
        if self.start_minimized:
            self.root.iconify()
        self.bg(fix_startup_shortcut, lambda msg: msg and self.write_log(msg))
        self.bg(lambda: server_info(self.port), self.on_boot_info)

    def on_boot_info(self, info):
        if info is not None:
            self.set_external()
            return
        self.start()

    def set_external(self):
        self.owned = False
        self.gen += 1
        self.set_status("externo", "Já estava ligado por outra janela (por exemplo o iniciar.bat). "
                                   "Desligar daqui também desliga o de lá.")
        self.watch()

    def start(self):
        node = find_node()
        if not node:
            self.set_status("erro", "O Node.js não foi encontrado. Instale a versão LTS em nodejs.org e abra este app de novo.")
            return
        if port_busy(self.port):
            # pode ser um Caderno ligado em outra janela depois que este painel abriu
            self.bg(lambda: server_info(self.port), lambda info: self.set_external() if info is not None else
                    self.set_status("erro", f"A porta {self.port} está ocupada por outro programa. Feche-o e clique em Ligar."))
            return
        self.set_status("iniciando", "Iniciando o servidor…")
        env = dict(os.environ, PORT=str(self.port))
        try:
            self.proc = subprocess.Popen([node, "server.js"], cwd=ROOT, env=env, stdout=subprocess.PIPE,
                                         stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                         creationflags=NO_WINDOW, text=True, encoding="utf-8", errors="replace")
        except OSError as e:
            self.set_status("erro", f"Erro ao iniciar o Node.js: {e}")
            return
        self.owned = True
        self.gen += 1
        threading.Thread(target=self.read_output, args=(self.proc,), daemon=True).start()
        self.bg(lambda p=self.proc: self.wait_ready(p), self.on_ready, gen=self.gen)

    def read_output(self, proc):
        for line in proc.stdout:
            if line.strip():
                self.logq.put(line)
        self.logq.put(f"[servidor encerrado, código {proc.wait()}]")

    def wait_ready(self, proc, limit=15):
        """(fora da janela) Espera o servidor responder. Devolve "ok", "fechou" ou "timeout"."""
        t0 = time.time()
        while True:
            if proc.poll() is not None:
                return "fechou"
            if server_info(self.port, 0.4) is not None:
                return "ok"
            if time.time() - t0 > limit:
                # não deixa um node travado segurando a porta
                proc.kill()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    pass
                return "timeout"
            time.sleep(0.3)

    def on_ready(self, res):
        if res == "ok":
            self.set_status("ativo", "Pode usar no navegador deste computador ou de qualquer aparelho na mesma rede Wi-Fi.")
            if self.var_open.get() and not self.opened_once and not self.start_minimized:
                self.open_browser()
            self.opened_once = True
            self.watch()
            return
        self.proc, self.owned = None, False
        if res == "fechou":
            self.set_status("erro", "O servidor fechou logo ao iniciar. Abra \"Ver registro\" para ver o motivo.")
        else:
            self.set_status("erro", "O servidor não respondeu em 15 segundos e foi encerrado. Veja o registro.")
        if not self.log_open:
            self.toggle_log()

    def watch(self):
        """Confere a cada 3 s se o servidor continua respondendo (pelo /api/health, resposta curta)."""
        if self.state not in ("ativo", "externo") or self.checking:
            return
        self.checking = True
        gen = self.gen

        def got(info):
            self.checking = False
            if gen != self.gen or self.state not in ("ativo", "externo"):
                return
            if info is None:
                if self.owned and self.proc and self.proc.poll() is not None:
                    self.proc, self.owned = None, False
                    self.set_status("erro", "O servidor parou sozinho. Veja o registro e clique em Ligar.")
                else:
                    self.set_status("parado", "O servidor foi desligado.")
                return
            self.root.after(3000, self.watch)

        self.bg(lambda: server_info(self.port), got)

    def stop(self, then=None):
        external = not self.owned
        self.set_status("parando", "Salvando os dados e desligando…")
        self.gen += 1
        proc = self.proc

        def work():
            # desligamento educado: o servidor grava as últimas mudanças antes de sair
            request_shutdown(self.port)
            if proc:
                try:
                    proc.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        pass
                return True
            # servidor de outra janela: confere que ele realmente saiu
            for _ in range(20):
                if server_info(self.port, 0.4) is None:
                    return True
                time.sleep(0.25)
            return False

        def done(stopped):
            self.proc = None
            self.owned = False
            self.checking = False
            if not stopped and external:
                self.set_external()
                self.set_status("externo", "Não consegui desligar o servidor da outra janela. Feche essa janela (por exemplo a do iniciar.bat).")
            else:
                self.set_status("parado", "Clique em Ligar para usar o site de novo.")
            if then:
                then()

        self.bg(work, done)

    def toggle(self):
        if self.state in ("ativo", "externo"):
            self.stop()
        elif self.state in ("parado", "erro"):
            self.start()

    def open_browser(self):
        webbrowser.open(f"http://localhost:{self.port}")

    # ----- opções -----
    def on_open_pref(self):
        self.cfg["open_browser"] = bool(self.var_open.get())
        save_config(self.cfg)

    def on_startup_pref(self):
        try:
            if self.var_startup.get():
                make_shortcut(STARTUP_LNK, "--minimizado")
            elif STARTUP_LNK.exists():
                STARTUP_LNK.unlink()
        except Exception as e:
            self.var_startup.set(STARTUP_LNK.exists())
            messagebox.showerror(APP_NAME, f"Não consegui alterar a inicialização com o Windows.\n\n{e}")

    def desktop_shortcut(self):
        link = desktop_dir() / f"{APP_NAME}.lnk"
        try:
            make_shortcut(link)
            messagebox.showinfo(APP_NAME, f"Atalho criado na Área de Trabalho:\n{link}")
        except Exception as e:
            messagebox.showerror(APP_NAME, f"Não consegui criar o atalho.\n\n{e}")

    def on_close(self):
        if self.state == "parando":
            return
        # pergunta sempre que o node aberto por este painel ainda estiver rodando (qualquer estado)
        if self.proc and self.proc.poll() is None:
            ans = messagebox.askyesnocancel(
                APP_NAME,
                "O servidor está ligado.\n\n"
                "Sim: desligar o servidor e fechar\n"
                "Não: só minimizar (o site continua funcionando)\n"
                "Cancelar: voltar")
            if ans is None:
                return
            if ans is False:
                self.root.iconify()
                return
            self.stop(then=self.root.destroy)
            return
        self.root.destroy()


_MUTEX = None


def already_running():
    """Instância única: se outro painel já está aberto, traz a janela dele para frente e devolve True."""
    global _MUTEX
    try:
        import ctypes
        from ctypes import wintypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.CreateMutexW.restype = wintypes.HANDLE
        k32.CreateMutexW.argtypes = (ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR)
        _MUTEX = k32.CreateMutexW(None, False, "Local\\CadernoDeGastos.Painel")
        if ctypes.get_last_error() != 183:      # ERROR_ALREADY_EXISTS
            return False
        user32 = ctypes.windll.user32
        proc_t = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        found = []

        def each(hwnd, _):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, buf, 256)
            if buf.value == "TkTopLevel":
                user32.GetWindowTextW(hwnd, buf, 256)
                if buf.value.startswith(APP_NAME + " ·"):
                    found.append(hwnd)
            return True
        user32.EnumWindows(proc_t(each), 0)
        for hwnd in found:
            user32.ShowWindow(hwnd, 9)          # SW_RESTORE
            user32.SetForegroundWindow(hwnd)
        return True
    except Exception:
        return False


def fix_startup_shortcut():
    """Se a pasta do app (ou o Python) mudou de lugar, o atalho de inicialização apontaria para o caminho
    antigo: recria. Devolve uma linha para o registro, ou None."""
    if not STARTUP_LNK.exists():
        return None
    target, args = read_shortcut(STARTUP_LNK)
    want_args = shortcut_args("--minimizado")
    if os.path.normcase(target) == os.path.normcase(pythonw()) and args == want_args:
        return None
    make_shortcut(STARTUP_LNK, "--minimizado")
    return "[atalho de inicialização atualizado para o caminho atual do app]"


def main():
    try:  # ícone próprio na barra de tarefas, em vez do ícone do Python
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("CadernoDeGastos.Painel")
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    if already_running():
        return
    try:
        root = tk.Tk()
    except Exception:
        log_error("Erro ao abrir a janela", traceback.format_exc())
        native_alert(f"Não consegui abrir o painel.\n\nDetalhes em:\n{ERROR_LOG}")
        return

    def on_tk_error(exc, val, tb):
        text = "".join(traceback.format_exception(exc, val, tb))
        log_error("Erro no painel", text)
        try:
            messagebox.showerror(APP_NAME, f"Algo deu errado no painel:\n{val}\n\nDetalhes em:\n{ERROR_LOG}")
        except Exception:
            pass
    root.report_callback_exception = on_tk_error
    try:
        App(root, start_minimized="--minimizado" in sys.argv)
    except Exception:
        log_error("Erro ao abrir o painel", traceback.format_exc())
        messagebox.showerror(APP_NAME, f"Não consegui abrir o painel.\n\nDetalhes em:\n{ERROR_LOG}")
        root.destroy()
        return
    root.mainloop()


if __name__ == "__main__":
    main()
