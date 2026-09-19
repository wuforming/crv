import { spawn } from 'node:child_process';

export interface PickResult {
  path: string | null;
  /** 用户在系统对话框里点了取消 */
  canceled?: boolean;
  error?: string;
}

/**
 * 唤起系统原生"选择文件夹"对话框（浏览器沙箱拿不到绝对路径，只能由本地进程代劳）。
 * macOS 用 osascript；其他平台返回 error，前端保留手动输入兜底。
 */
export function pickFolder(prompt = '选择要 Review 的 git 仓库文件夹'): Promise<PickResult> {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ path: null, error: '当前平台不支持系统文件夹选择，请手动输入路径' });
      return;
    }
    // JSON.stringify 的双引号转义与 AppleScript 字符串兼容
    const script = `POSIX path of (choose folder with prompt ${JSON.stringify(prompt)})`;
    const child = spawn('osascript', ['-e', script]);
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += String(d);
    });
    child.stderr.on('data', (d) => {
      err += String(d);
    });
    child.on('error', () => resolve({ path: null, error: '无法启动文件夹选择对话框（osascript 不可用）' }));
    child.on('close', (code) => {
      if (code === 0) {
        const p = out.trim().replace(/\/+$/, '');
        resolve(p ? { path: p } : { path: null, error: '未选择文件夹' });
        return;
      }
      // AppleScript 错误 -128 = User canceled
      if (err.includes('User canceled') || err.includes('-128')) {
        resolve({ path: null, canceled: true });
        return;
      }
      resolve({ path: null, error: '选择文件夹失败' });
    });
  });
}
