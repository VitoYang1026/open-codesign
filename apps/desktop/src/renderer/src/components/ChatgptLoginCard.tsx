import { useT } from '@open-codesign/i18n';
import { Button } from '@open-codesign/ui';
import { Sparkles } from 'lucide-react';
import type { CodexOAuthStatus } from '../../../preload/index';

export interface ChatgptLoginCardProps {
  /** Called after a successful login or logout so the parent can refresh its provider list. */
  onStatusChange?: () => void | Promise<void>;
}

export type ChatgptViewState = 'not-logged-in' | 'loading' | 'logged-in';

export function resolveViewState(
  status: CodexOAuthStatus | null,
  loading: boolean,
): ChatgptViewState {
  if (loading) return 'loading';
  if (status?.loggedIn) return 'logged-in';
  return 'not-logged-in';
}

interface CodexOAuthApi {
  status(): Promise<CodexOAuthStatus>;
  login(): Promise<CodexOAuthStatus>;
  logout(): Promise<CodexOAuthStatus>;
}

type PushToastLike = (toast: { variant: 'error'; title: string; description?: string }) => unknown;

export interface PerformLoginDeps {
  api: CodexOAuthApi;
  setStatus: (s: CodexOAuthStatus) => void;
  setLoading: (v: boolean) => void;
  pushToast: PushToastLike;
  onStatusChange?: () => void | Promise<void>;
}

export async function performLogin(deps: PerformLoginDeps): Promise<void> {
  deps.setLoading(true);
  try {
    const next = await deps.api.login();
    deps.setStatus(next);
    await deps.onStatusChange?.();
  } catch (err) {
    deps.pushToast({
      variant: 'error',
      title: 'ChatGPT 登录失败',
      description: err instanceof Error ? err.message : '未知错误',
    });
  } finally {
    deps.setLoading(false);
  }
}

export interface PerformLogoutDeps {
  api: CodexOAuthApi;
  setStatus: (s: CodexOAuthStatus) => void;
  pushToast: PushToastLike;
  confirm: (message: string) => boolean;
  onStatusChange?: () => void | Promise<void>;
}

export async function performLogout(deps: PerformLogoutDeps): Promise<boolean> {
  if (!deps.confirm('确定登出 ChatGPT 订阅吗？')) return false;
  try {
    const next = await deps.api.logout();
    deps.setStatus(next);
    await deps.onStatusChange?.();
    return true;
  } catch (err) {
    deps.pushToast({
      variant: 'error',
      title: 'ChatGPT 登出失败',
      description: err instanceof Error ? err.message : '未知错误',
    });
    return false;
  }
}

export function ChatgptLoginCard(_props: ChatgptLoginCardProps) {
  const t = useT();
  // Phase-1 WIP: feature is landing on feat/codex-chatgpt-oauth and is not
  // yet stable against the real backend. Render a coming-soon notice so
  // users don't try to log in, hit an opaque 400, and blame the app.
  // Full implementation (login/logout/status hooks, performLogin/
  // performLogout helpers) stays exported below so the feature branch can
  // flip this back on with a one-line change.
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-3)] py-[var(--space-2_5)] flex items-start gap-[var(--space-3)]">
      <div className="min-w-0 flex-1">
        <div className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
          {t('settings.providers.chatgptLogin.title')}
        </div>
        <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-0.5 leading-[var(--leading-body)]">
          {t('settings.providers.chatgptLogin.description')}
        </p>
      </div>
      <div className="shrink-0">
        <Button variant="secondary" size="sm" disabled>
          <Sparkles className="w-3.5 h-3.5" />
          {t('settings.providers.chatgptLogin.comingSoon')}
        </Button>
      </div>
    </div>
  );
}
