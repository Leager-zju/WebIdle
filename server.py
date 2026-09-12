import os
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DIST_ROOT = PROJECT_ROOT / 'dist'

# 开发者模式：启动时用它指定的脚本重新构建 dist。
#   build:devtools 会打进开发者面板（等价于 vite build --mode devtools），
#   build 则完全不含开发者功能。想用纯净产物时把 DEV_TOOLS 改成 False，或：
#       WEBIDLE_DEV_TOOLS=0 python server.py
#   加 --no-build 参数可以跳过构建，直接托管现有 dist。
DEV_TOOLS = os.environ.get('WEBIDLE_DEV_TOOLS', '1').strip().lower() not in ('0', 'false', 'no', 'off')
SKIP_BUILD = '--no-build' in sys.argv
BUILD_SCRIPT = 'build:devtools' if DEV_TOOLS else 'build'


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


class WebGameHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html'}
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    if SKIP_BUILD:
        print('[info] 已指定 --no-build，跳过构建。')
    else:
        build_dist()

    if DIST_ROOT.exists():
        ROOT = DIST_ROOT
    else:
        ROOT = PROJECT_ROOT
        print('[warn] 未找到 dist/ 目录，正在提供源码根目录。')
        print('[warn] 源码 index.html 引用的是 ./src/main.ts，浏览器无法直接执行，页面会完全没有反应。')
        print('[warn] 请先执行：npm run build（或 npm run build:devtools），然后重新启动本服务。')
        print('[warn] 或者使用开发服务器：npm run dev')

    server = ThreadingHTTPServer(('127.0.0.1', 8000), WebGameHandler)
    print(f'WebIdle running at http://localhost:8000 ({ROOT})')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
