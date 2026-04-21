<script setup lang="ts">
import { onMounted, ref } from 'vue';
import pkg from '../../../package.json';

/**
 * Smart download row — detects the visitor's OS + CPU architecture and
 * renders a prominent "download the right asset" button, plus a secondary
 * row of links to the other platforms so nothing is hidden.
 *
 * Why a separate component rather than editing the hero action:
 * VitePress's hero is declarative frontmatter — it doesn't run Vue logic.
 * The hero button stays as a safe generic "Download" link to the Releases
 * page; this component lives directly under the hero and upgrades the
 * experience when JS is available. If JS is off (rare) the visitor just
 * uses the hero button and picks manually from the Releases page.
 *
 * Version is pulled from the workspace root package.json at build time so
 * the asset URLs always match the latest release tag. File names must
 * track electron-builder artifactName patterns in apps/desktop/electron-builder.yml.
 */

const latestVersion = (pkg as { version: string }).version;
const releasesBase = `https://github.com/OpenCoworkAI/open-codesign/releases/download/v${latestVersion}`;

type Asset = { label: string; file: string; size: string; url: string };

const macArm: Asset = {
  label: 'macOS · Apple Silicon',
  file: `open-codesign-${latestVersion}-arm64.dmg`,
  size: '135 MB',
  url: `${releasesBase}/open-codesign-${latestVersion}-arm64.dmg`,
};
const macIntel: Asset = {
  label: 'macOS · Intel',
  file: `open-codesign-${latestVersion}-x64.dmg`,
  size: '140 MB',
  url: `${releasesBase}/open-codesign-${latestVersion}-x64.dmg`,
};
const winX64: Asset = {
  label: 'Windows · x64',
  file: `open-codesign-${latestVersion}-x64-setup.exe`,
  size: '~110 MB',
  url: `${releasesBase}/open-codesign-${latestVersion}-x64-setup.exe`,
};
const winArm: Asset = {
  label: 'Windows · ARM64',
  file: `open-codesign-${latestVersion}-arm64-setup.exe`,
  size: '~100 MB',
  url: `${releasesBase}/open-codesign-${latestVersion}-arm64-setup.exe`,
};
const linuxAppImage: Asset = {
  label: 'Linux · AppImage (x64)',
  file: `open-codesign-${latestVersion}-x64.AppImage`,
  size: '~140 MB',
  url: `${releasesBase}/open-codesign-${latestVersion}-x64.AppImage`,
};
const linuxSnap: Asset = {
  label: 'Linux · Snap (x64)',
  file: `open-codesign-${latestVersion}-x64.snap`,
  size: '~140 MB',
  url: `${releasesBase}/open-codesign-${latestVersion}-x64.snap`,
};

const allAssets: Asset[] = [macArm, macIntel, winX64, winArm, linuxAppImage, linuxSnap];
const primary = ref<Asset | null>(null);
const detectedLabel = ref<string>('');

function detectPrimaryAsset(): { asset: Asset | null; label: string } {
  if (typeof navigator === 'undefined') return { asset: null, label: '' };
  const ua = navigator.userAgent;
  // Prefer the higher-confidence signal when modern browsers expose it.
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const platformHint = uaData?.platform?.toLowerCase() ?? '';

  const isMac = /mac/i.test(platformHint) || /Macintosh|Mac OS X/.test(ua);
  const isWin = /windows/i.test(platformHint) || /Windows NT/.test(ua);
  const isLinux = /linux/i.test(platformHint) || (!isMac && !isWin && /Linux/.test(ua));

  if (isMac) {
    // Intel Macs report "Intel" in navigator.cpuClass or UA; Apple Silicon
    // ships a UA string that no longer distinguishes — safer default on new
    // Macs is arm64 since Apple Silicon shipped in 2020 and Intel Macs are
    // dwindling. But when we CAN tell (old UA with "Intel Mac"), honor it.
    const looksIntel = /Intel Mac OS X/.test(ua) && !/AppleWebKit\/6(0[6-9]|[1-9][0-9])/.test(ua);
    return looksIntel
      ? { asset: macIntel, label: 'macOS · Intel detected' }
      : { asset: macArm, label: 'macOS · Apple Silicon detected' };
  }
  if (isWin) {
    const isArm = /ARM64|aarch64/i.test(ua) || /arm/i.test(platformHint);
    return isArm
      ? { asset: winArm, label: 'Windows · ARM64 detected' }
      : { asset: winX64, label: 'Windows · x64 detected' };
  }
  if (isLinux) return { asset: linuxAppImage, label: 'Linux detected' };
  return { asset: null, label: '' };
}

onMounted(() => {
  const { asset, label } = detectPrimaryAsset();
  primary.value = asset;
  detectedLabel.value = label;
});

const secondaryAssets = () => {
  const p = primary.value;
  return p ? allAssets.filter((a) => a.file !== p.file) : allAssets;
};
</script>

<template>
  <div class="smart-download">
    <div v-if="primary" class="primary-row">
      <a :href="primary.url" class="primary-button" :download="primary.file">
        <span class="primary-label">下载 · {{ primary.label }}</span>
        <span class="primary-meta">{{ primary.file }} · {{ primary.size }}</span>
      </a>
      <p class="detected-note">{{ detectedLabel }} · v{{ latestVersion }}</p>
    </div>

    <details class="other-platforms">
      <summary>其他平台 / Other platforms</summary>
      <ul>
        <li v-for="asset in secondaryAssets()" :key="asset.file">
          <a :href="asset.url" :download="asset.file">
            {{ asset.label }}
            <span class="meta">{{ asset.size }}</span>
          </a>
        </li>
        <li class="releases-link">
          <a href="https://github.com/OpenCoworkAI/open-codesign/releases">
            所有版本 / All releases on GitHub →
          </a>
        </li>
      </ul>
    </details>

    <p class="install-hint">
      <strong>macOS 安装</strong>：拖到「应用程序」。双击打开若被 Gatekeeper 拦截（常见于 Sequoia 15+），终端跑一次：<br/>
      <code>xattr -cr "/Applications/Open CoDesign.app"</code><br/>
      然后再双击就能打开。（0.1.x 旧 build 路径是 <code>/Applications/open-codesign.app</code>。）
    </p>
  </div>
</template>

<style scoped>
.smart-download {
  max-width: 760px;
  margin: 1.5rem auto 2.5rem;
  padding: 0 1.5rem;
}

.primary-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}

.primary-button {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem 2rem;
  border-radius: 12px;
  background: var(--vp-c-brand-1, #c96442);
  color: #fff !important;
  font-weight: 600;
  text-decoration: none !important;
  transition:
    transform 120ms ease-out,
    box-shadow 160ms ease,
    background-color 120ms ease;
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.04), 0 8px 24px -8px rgba(201, 100, 66, 0.35);
}
.primary-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.04), 0 12px 28px -8px rgba(201, 100, 66, 0.45);
  background: var(--vp-c-brand-2, #b8583a);
}
.primary-button:active {
  transform: scale(0.98);
}
.primary-label {
  font-size: 1.05rem;
  letter-spacing: -0.01em;
}
.primary-meta {
  font-size: 0.8rem;
  font-weight: 400;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}
.detected-note {
  font-size: 0.8rem;
  color: var(--vp-c-text-2, #6b6b6b);
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.other-platforms {
  margin: 1rem auto 0;
  max-width: 520px;
  font-size: 0.88rem;
  color: var(--vp-c-text-2, #6b6b6b);
}
.other-platforms summary {
  cursor: pointer;
  text-align: center;
  padding: 0.4rem 0;
  user-select: none;
  transition: color 120ms ease;
}
.other-platforms summary:hover {
  color: var(--vp-c-text-1, #1a1a1a);
}
.other-platforms ul {
  list-style: none;
  padding: 0.75rem 0 0;
  margin: 0;
}
.other-platforms li {
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--vp-c-divider, rgba(0, 0, 0, 0.08));
}
.other-platforms li:last-child {
  border-bottom: none;
}
.other-platforms a {
  color: var(--vp-c-text-1, #1a1a1a);
  text-decoration: none;
  display: flex;
  justify-content: space-between;
  padding: 0.15rem 0;
}
.other-platforms a:hover {
  color: var(--vp-c-brand-1, #c96442);
}
.other-platforms .meta {
  color: var(--vp-c-text-3, #9a9a9a);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}
.other-platforms .releases-link a {
  justify-content: center;
  font-weight: 500;
  color: var(--vp-c-brand-1, #c96442);
}

.install-hint {
  max-width: 640px;
  margin: 1.2rem auto 0;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--vp-c-brand-1, #c96442);
  background: rgba(201, 100, 66, 0.05);
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--vp-c-text-2, #6b6b6b);
  border-radius: 0 6px 6px 0;
}
.install-hint code {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  margin: 0.2rem 0;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  font-size: 0.78rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1, #1a1a1a);
}
.install-hint strong {
  color: var(--vp-c-text-1, #1a1a1a);
}
</style>
