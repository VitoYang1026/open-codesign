import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, dialog, safeStorage, shell } from './electron-runtime';
import { getLogger } from './logger';

/**
 * Keychain UX layer. Wraps the raw `safeStorage` calls with two one-time
 * dialogs to turn the default macOS experience (opaque "password required"
 * modal appearing with no context) into something a non-technical user can
 * reason about.
 *
 *   (C) Friendly explainer — before the first keychain prompt of the app's
 *       lifetime, show an in-app message telling the user macOS is about
 *       to ask for their login password and recommending they click
 *       "Always Allow" so it doesn't repeat. Flag stored as a zero-byte
 *       file in userData so it persists across launches.
 *
 *   (E) Graceful degradation — when `safeStorage.isEncryptionAvailable()`
 *       returns false (most commonly the app is running from a read-only
 *       DMG mount instead of /Applications, so Electron can't establish a
 *       keychain trust entry), surface a helpful dialog with a button to
 *       open the Applications folder and quit. Shown at most once per
 *       session — subsequent calls re-throw silently so we don't spam the
 *       user with modals if they dismiss it.
 */

const log = getLogger('keychain-ux');

const EXPLAINER_FLAG_FILE = 'keychain-explainer-seen';

let unavailableDialogShownThisSession = false;

function explainerFlagPath(): string {
  return join(app.getPath('userData'), EXPLAINER_FLAG_FILE);
}

function hasSeenExplainer(): boolean {
  try {
    return existsSync(explainerFlagPath());
  } catch {
    return false;
  }
}

function markExplainerSeen(): void {
  try {
    writeFileSync(explainerFlagPath(), '', { flag: 'w' });
  } catch (err) {
    log.warn('[keychain-ux] failed to persist explainer flag', err);
  }
}

/**
 * Show the first-time keychain explainer. Blocks until dismissed. Safe to
 * call unconditionally — returns immediately if the user has already seen
 * it on any prior launch.
 */
export async function maybeShowKeychainExplainer(): Promise<void> {
  if (hasSeenExplainer()) return;
  // Only relevant when safeStorage will actually prompt (macOS / Linux
  // with a working keychain). If encryption isn't even available, the
  // unavailable dialog handles the UX — skip the explainer.
  if (!safeStorage.isEncryptionAvailable()) return;

  try {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Open CoDesign 需要使用系统钥匙串',
      message: '你的 API key 将会加密存在你自己的电脑上',
      detail: [
        'macOS 接下来会弹出一个系统窗口，问你是否允许 Open CoDesign 访问钥匙串。',
        '',
        '请点「始终允许」（Always Allow）— 之后 Open CoDesign 就不会再问了。',
        '',
        '你的 key 只在你本机保存，不会上传到任何云服务。',
      ].join('\n'),
      buttons: ['我知道了'],
      defaultId: 0,
    });
  } catch (err) {
    log.warn('[keychain-ux] explainer dialog failed', err);
  }
  markExplainerSeen();
}

/**
 * Show the "keychain unavailable" dialog with actionable next steps. Shown
 * at most once per session to avoid modal spam. Callers should treat this
 * as advisory and still surface the underlying error to the user so
 * failing IPC handlers return something the renderer can render.
 */
export async function maybeShowKeychainUnavailableDialog(): Promise<void> {
  if (unavailableDialogShownThisSession) return;
  unavailableDialogShownThisSession = true;

  const fromDmg = process.execPath.includes('/Volumes/');
  try {
    const response = await dialog.showMessageBox({
      type: 'warning',
      title: '系统钥匙串不可用',
      message: '无法加密保存你的 API key',
      detail: [
        fromDmg
          ? '最常见原因：你直接从 DMG 运行了 Open CoDesign，没有拖到「应用程序」文件夹。'
          : '系统钥匙串当前无法访问。可能是 macOS 权限未授权，或者 Open CoDesign 不在「应用程序」文件夹中。',
        '',
        '解决办法：',
        '1. 退出 Open CoDesign（Cmd+Q）',
        '2. 把 Open CoDesign.app 拖到「应用程序」文件夹',
        '3. 从「应用程序」启动',
        '',
        '之后第一次启动 macOS 会请求权限，请选「始终允许」。',
      ].join('\n'),
      buttons: ['打开「应用程序」文件夹', '先不管，继续使用'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response.response === 0) {
      await shell.openPath('/Applications');
    }
  } catch (err) {
    log.warn('[keychain-ux] unavailable dialog failed', err);
  }
}

/**
 * Preflight for any IPC handler that is about to encrypt or decrypt. Returns
 * `true` when keychain ops should proceed, `false` when the caller should
 * abort the operation (unavailable dialog will have been shown).
 */
export async function prepareKeychain(): Promise<boolean> {
  if (!safeStorage.isEncryptionAvailable()) {
    await maybeShowKeychainUnavailableDialog();
    return false;
  }
  await maybeShowKeychainExplainer();
  return true;
}
