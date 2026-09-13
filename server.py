import os
import subprocess
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DIST_ROOT = PROJECT_ROOT / 'dist'
PORT = 8000

# 开发者模式：启动时用它指定的脚本重新构建 dist。
#   build:devtools 会打进开发者面板（等价于 vite build --mode devtools），
#   build 则完全不含开发者功能。想用纯净产物时把 DEV_TOOLS 改成 False，或：
#       WEBIDLE_DEV_TOOLS=0 python server.py
#   加 --no-build 参数可以跳过构建，直接托管现有 dist。
DEV_TOOLS = os.environ.get('WEBIDLE_DEV_TOOLS', '1').strip().lower() not in ('0', 'false', 'no', 'off')
SKIP_BUILD = '--no-build' in sys.argv
BUILD_SCRIPT = 'build:devtools' if DEV_TOOLS else 'build'
# 开发者面板只在设置页出现，用这个类名当标记检查产物（见 verify_dist）。
DEV_TOOLS_MARKER = 'dev-panel'


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
        print('[error] 端口多半被上一次的 python server.py 占着，那个窗口还在托管旧产物。')
        print('[error] 请关掉它（或在任务管理器里结束占用该端口的 python 进程）后重新运行本脚本。')
        sys.exit(1)

    print(f'WebIdle running at http://localhost:8000 ({ROOT})')
    print('[info] 浏览器里按 Ctrl+Shift+R 强制刷新一次，确保没有拿旧的缓存。')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
