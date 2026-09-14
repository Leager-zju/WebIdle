import os
import re
import signal
import subprocess
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DIST_ROOT = PROJECT_ROOT / 'dist'
PORT = 8000
SCRIPT_NAME = Path(__file__).name

# 开发者模式：启动时用它指定的脚本重新构建 dist。
#   build:devtools 会打进开发者面板（等价于 vite build --mode devtools），
#   build 则完全不含开发者功能。想用纯净产物时把 DEV_TOOLS 改成 False，或：
#       WEBIDLE_DEV_TOOLS=0 python server.py
#   加 --no-build 参数可以跳过构建，直接托管现有 dist。
DEV_TOOLS = os.environ.get('WEBIDLE_DEV_TOOLS', '1').strip().lower() not in ('0', 'false', 'no', 'off')
SKIP_BUILD = '--no-build' in sys.argv
# 启动前先结束上一次占用该端口的旧实例，省得每回都手动去关那个窗口。
# 只结束「确认是本脚本的旧实例」的进程，见 kill_stale_servers。
# 加 --no-kill 参数可以跳过这一步，自己手动关。
KILL_STALE = '--no-kill' not in sys.argv
BUILD_SCRIPT = 'build:devtools' if DEV_TOOLS else 'build'
# 开发者面板只在设置页出现，用这个类名当标记检查产物（见 verify_dist）。
DEV_TOOLS_MARKER = 'dev-panel'
# 允许被自动结束的映像名，避免误杀 node 等别的服务。
PYTHON_IMAGE_NAMES = {'python.exe', 'python', 'python3', 'python3.exe', 'py.exe', 'py'}


def _get_console_cp():
    """Windows 上 npm 子进程会把控制台代码页切走，导致之后本脚本的中文变成乱码，先记下原值。"""
    if os.name != 'nt':
        return None
    try:
        import ctypes
        return ctypes.windll.kernel32.GetConsoleOutputCP()
    except Exception:
        return None


def _set_console_cp(code_page):
    if os.name == 'nt' and code_page:
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleOutputCP(code_page)
        except Exception:
            pass


def build_dist() -> bool:
    print(f'[build] npm run {BUILD_SCRIPT} (dev tools: {"ON" if DEV_TOOLS else "OFF"})', flush=True)
    code_page = _get_console_cp()
    try:
        result = subprocess.run(
            ['npm', 'run', BUILD_SCRIPT],
            cwd=str(PROJECT_ROOT),
            shell=(os.name == 'nt')  # Windows 上 npm 是 npm.cmd
        )
    except FileNotFoundError:
        _set_console_cp(code_page)
        print('[error] 未找到 npm，请先安装 Node.js 并把它加入 PATH。')
        return False
    _set_console_cp(code_page)
    if result.returncode != 0:
        print(f'[error] 构建失败（退出码 {result.returncode}），请先看上面的报错。')
        return False
    return True


def dist_bundles():
    assets = DIST_ROOT / 'assets'
    return sorted(assets.glob('*.js')) if assets.is_dir() else []


def verify_dist() -> bool:
    """构建完再确认一次产物符合预期。

    之前踩过的坑：构建失败或没重新构建时，脚本会继续托管上一次的 dist —— 于是「明明是
    build:devtools 启动的，设置页里却没有开发者功能」。这里直接检查产物里的标记，不满足就退出。"""
    bundles = dist_bundles()
    if not bundles:
        print('[error] dist/assets 下没有 JS 产物，构建可能没有真正写入。')
        return False
    has_marker = any(DEV_TOOLS_MARKER in bundle.read_text(encoding='utf-8', errors='ignore') for bundle in bundles)
    print(f'[info] 产物：{", ".join(bundle.name for bundle in bundles)}')
    if DEV_TOOLS and not has_marker:
        print(f'[error] 产物里找不到 "{DEV_TOOLS_MARKER}"：开发者功能没有打进去。')
        print('[error] 多半是构建失败后仍在托管旧 dist，请先解决 npm run build:devtools 的报错。')
        return False
    if not DEV_TOOLS and has_marker:
        print(f'[error] 产物里仍然有 "{DEV_TOOLS_MARKER}"：这次应该构建纯净产物，请检查 vite.config.ts 的开关规则。')
        return False
    print(f'[info] 开发者功能：{"已开启（设置页底部可见开发者面板）" if DEV_TOOLS else "已关闭"}')
    return True


def listening_pids(port):
    """找出正在监听该端口的进程 PID（Windows 用 netstat，类 Unix 用 lsof / ss）。"""
    if os.name == 'nt':
        try:
            output = subprocess.run(['netstat', '-ano', '-p', 'TCP'], capture_output=True, text=True, errors='ignore').stdout
        except OSError:
            return []
        pids = set()
        for line in output.splitlines():
            # 形如：TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    12345
            fields = line.split()
            if len(fields) >= 5 and fields[0].upper() == 'TCP' and fields[3].upper() == 'LISTENING':
                if fields[1].rsplit(':', 1)[-1] == str(port) and fields[4].isdigit():
                    pids.add(int(fields[4]))
        return sorted(pids)
    try:
        output = subprocess.run(['lsof', '-ti', f'tcp:{port}', '-sTCP:LISTEN'], capture_output=True, text=True, errors='ignore').stdout
    except OSError:
        output = ''
    pids = {int(token) for token in output.split() if token.isdigit()}
    if pids:
        return sorted(pids)
    try:
        output = subprocess.run(['ss', '-lptnH', f'sport = :{port}'], capture_output=True, text=True, errors='ignore').stdout
    except OSError:
        return []
    return sorted({int(match.group(1)) for match in re.finditer(r'pid=(\d+)', output)})


def _windows_command_line(pid):
    """用 PowerShell 取命令行；取不到就返回 None（此时只能靠映像名判断）。"""
    try:
        output = subprocess.run(
            ['powershell', '-NoProfile', '-Command', f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine"],
            capture_output=True, text=True, errors='ignore'
        ).stdout
    except OSError:
        return None
    return output.strip() or None


def describe_process(pid):
    """返回 (映像名, 命令行)，拿不到的部分为 None。"""
    if os.name == 'nt':
        try:
            output = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV', '/NH'], capture_output=True, text=True, errors='ignore').stdout.strip()
        except OSError:
            output = ''
        name = output.split('","')[0].strip('"').lower() if output.startswith('"') else None
        return name, _windows_command_line(pid)
    try:
        name = Path(f'/proc/{pid}/comm').read_text(encoding='utf-8', errors='ignore').strip().lower() or None
    except OSError:
        name = None
    try:
        command_line = Path(f'/proc/{pid}/cmdline').read_bytes().replace(b'\0', b' ').decode('utf-8', 'ignore').strip() or None
    except OSError:
        command_line = None
    return name, command_line


def _pid_alive(pid):
    if os.name == 'nt':
        try:
            output = subprocess.run(['tasklist', '/FI', f'PID eq {pid}', '/FO', 'CSV', '/NH'], capture_output=True, text=True, errors='ignore').stdout
        except OSError:
            return False
        return str(pid) in output
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def terminate_pid(pid):
    """结束进程；Windows 直接 taskkill /F，类 Unix 先 SIGTERM 再 SIGKILL。"""
    if os.name == 'nt':
        try:
            result = subprocess.run(['taskkill', '/PID', str(pid), '/F'], capture_output=True, text=True, errors='ignore')
        except OSError:
            return False
        return result.returncode == 0
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return False
    for _ in range(20):
        if not _pid_alive(pid):
            return True
        time.sleep(0.1)
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass
    return not _pid_alive(pid)


def wait_port_free(port, timeout=5.0):
    deadline = time.monotonic() + timeout
    while True:
        if not listening_pids(port):
            return True
        if time.monotonic() >= deadline:
            return False
        time.sleep(0.2)


def kill_stale_servers(port):
    """结束上一次占用该端口的本脚本实例，让新实例能顺利监听。

    只结束「确认是本脚本旧实例」的进程：映像名必须是 Python，且命令行（能读到的话）里必须
    出现本脚本文件名。宁可留一个旧进程让你手动处理，也不误杀别的服务。"""
    pids = listening_pids(port)
    if not pids:
        return True
    for pid in pids:
        if pid == os.getpid():
            continue
        name, command_line = describe_process(pid)
        if name not in PYTHON_IMAGE_NAMES:
            print(f'[warn] 端口 {port} 被 PID {pid}（{name or "未知程序"}）占用，看起来不是本脚本的旧实例，不自动结束。')
            continue
        if command_line and SCRIPT_NAME not in command_line:
            print(f'[warn] 端口 {port} 被 PID {pid} 占用，但命令行里没有 {SCRIPT_NAME}，不自动结束。')
            print(f'[warn] 该进程命令行：{command_line}')
            continue
        print(f'[info] 端口 {port} 被上一次的 {SCRIPT_NAME} 占用（PID {pid}），正在结束它……')
        if not terminate_pid(pid):
            print(f'[error] 结束 PID {pid} 失败，请手动关掉那个窗口。')
            return False
    if wait_port_free(port):
        print(f'[info] 端口 {port} 已释放。')
        return True
    print(f'[error] 端口 {port} 结束后仍未释放，请检查是否还有别的程序在监听。')
    return False


class WebGameServer(ThreadingHTTPServer):
    """端口被占用时直接报错。

    Windows 上 SO_REUSEADDR 允许两个进程同时监听同一端口，于是「旧实例 + 新实例」会并存，
    请求被旧实例处理，看到的还是旧产物 —— 这正是之前「设置页没有开发者功能」的常见原因。"""
    allow_reuse_address = False


class WebGameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    # 先腾端口再构建：否则旧窗口会在整个构建期间继续托管旧产物。
    if not KILL_STALE:
        print('[info] 已指定 --no-kill，跳过结束旧实例，端口占用请自行处理。')
    elif not kill_stale_servers(PORT):
        print(f'[error] 端口 {PORT} 仍被占用，已中止启动。')
        sys.exit(1)

    if SKIP_BUILD:
        print('[info] 已指定 --no-build，跳过构建，按现有 dist 托管。')
    elif not build_dist():
        print('[error] 构建没有完成，已中止启动：继续托管旧产物只会让你以为改动生效了。')
        sys.exit(1)

    if not SKIP_BUILD and not verify_dist():
        sys.exit(1)

    if DIST_ROOT.exists():
        ROOT = DIST_ROOT
    else:
        ROOT = PROJECT_ROOT
        print('[warn] 未找到 dist/ 目录，正在提供源码根目录。')
        print('[warn] 源码 index.html 引用的是 ./src/main.ts，浏览器无法直接执行，页面会完全没有反应。')
        print('[warn] 请先执行：npm run build（或 npm run build:devtools），然后重新启动本服务。')
        print('[warn] 或者使用开发服务器：npm run dev')

    try:
        server = WebGameServer(('127.0.0.1', PORT), WebGameHandler)
    except OSError as error:
        print(f'[error] 无法监听 127.0.0.1:{PORT}：{error}')
        print('[error] 启动前已尝试结束旧实例，说明占用方是别的程序，或本次用了 --no-kill。')
        for pid in listening_pids(PORT):
            name, command_line = describe_process(pid)
            print(f'[error] 占用者：PID {pid} {name or "未知程序"} {command_line or ""}'.rstrip())
        print('[error] 请结束上面这些进程后重新运行本脚本。')
        sys.exit(1)

    print(f'WebIdle running at http://localhost:8000 ({ROOT})')
    print('[info] 浏览器里按 Ctrl+Shift+R 强制刷新一次，确保没有拿旧的缓存。')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
