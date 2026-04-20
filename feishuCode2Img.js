// ==UserScript==
// @name         飞书代码块复制为图片（保留代码块标题版）
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  飞书代码块右下角添加“📸 图片”按钮，复制为极简代码图片（保留“代码块”标题）
// @author       OpenAI
// @match        *://*.feishu.cn/*
// @match        *://*.larksuite.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LIB_URL = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js';
  const ENHANCED_ATTR = 'data-copy-image-enhanced';
  let libLoading = false;

  function toast(message, isError = false) {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      max-width: 360px;
      padding: 10px 14px;
      border-radius: 8px;
      color: #fff;
      font-size: 13px;
      line-height: 1.4;
      background: ${isError ? 'rgba(220,38,38,.95)' : 'rgba(17,24,39,.92)'};
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
      pointer-events: none;
      opacity: 0;
      transform: translateY(-6px);
      transition: all .18s ease;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => el.remove(), 180);
    }, 1500);
  }

  function ensureStyle() {
    if (document.getElementById('feishu-copy-image-style')) return;
    const style = document.createElement('style');
    style.id = 'feishu-copy-image-style';
    style.textContent = `
      .feishu-copy-image-btn {
        position: absolute !important;
        right: 8px !important;
        bottom: 8px !important;
        z-index: 9999 !important;
        display: inline-flex !important;
        align-items: center !important;
        gap: 4px !important;
        padding: 4px 8px !important;
        border: 1px solid rgba(0,0,0,.10) !important;
        border-radius: 6px !important;
        background: rgba(255,255,255,.92) !important;
        color: #1f2329 !important;
        font-size: 12px !important;
        line-height: 1.2 !important;
        cursor: pointer !important;
        box-shadow: 0 2px 8px rgba(0,0,0,.08) !important;
        backdrop-filter: blur(4px) !important;
      }
      .feishu-copy-image-btn:hover {
        background: #fff !important;
        border-color: rgba(0,0,0,.16) !important;
      }
      .feishu-copy-image-btn[disabled] {
        opacity: .65 !important;
        cursor: default !important;
      }
    `;
    document.head.appendChild(style);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureLib() {
    if (window.htmlToImage) return;
    if (libLoading) {
      while (!window.htmlToImage) {
        await new Promise(r => setTimeout(r, 100));
      }
      return;
    }
    libLoading = true;
    await loadScript(LIB_URL);
    libLoading = false;
  }

  function getCodeBlocks() {
    return Array.from(
      document.querySelectorAll('.block[data-block-type="code"] .editor-kit-code-block')
    );
  }

  function saveStyle(el, keys) {
    const old = {};
    keys.forEach(k => old[k] = el.style[k]);
    return old;
  }

  function restoreStyle(el, old) {
    Object.keys(old).forEach(k => {
      el.style[k] = old[k];
    });
  }

  function hideElement(el, restores) {
    if (!el) return;
    const old = saveStyle(el, ['display', 'visibility']);
    el.style.display = 'none';
    el.style.visibility = 'hidden';
    restores.push(() => restoreStyle(el, old));
  }

  function prepareForCapture(codeBlock, button) {
    const restores = [];

    // 隐藏自己的按钮
    hideElement(button, restores);

    // 隐藏顶部工具栏（Plain Text / 自动换行 / 复制）
    codeBlock.querySelectorAll('.code-block-header-toolbar').forEach(el => hideElement(el, restores));

    // 隐藏 header 中 svg（左侧小箭头等）
    codeBlock.querySelectorAll('.code-block-header svg').forEach(el => hideElement(el, restores));

    // 隐藏拖拽控件
    codeBlock.querySelectorAll('.draggable-btn').forEach(el => hideElement(el, restores));

    // 去掉内容区滚动条，完整展开；marginTop 至少保留 header 高度，避免与 header 重叠
    const header = codeBlock.querySelector('.code-block-header');
    const content = codeBlock.querySelector('.code-block-content');
    if (content) {
      const old = saveStyle(content, [
        'overflow',
        'overflowX',
        'overflowY',
        'height',
        'maxHeight',
        'width',
        'maxWidth',
        'paddingRight',
        'marginTop'
      ]);
      content.style.overflow = 'visible';
      content.style.overflowX = 'visible';
      content.style.overflowY = 'visible';
      content.style.height = 'auto';
      content.style.maxHeight = 'none';
      content.style.width = 'auto';
      content.style.maxWidth = 'none';
      content.style.paddingRight = '0px';
      // 保留 header 占据的高度，防止内容上移后与 header 重叠
      const headerH = header ? header.getBoundingClientRect().height : 0;
      const origMT = parseInt(getComputedStyle(content).marginTop, 10) || 0;
      content.style.marginTop = Math.max(origMT, headerH) + 'px';
      restores.push(() => restoreStyle(content, old));
    }

    // 整体展开
    const resize = codeBlock.querySelector('.code-block-resize');
    if (resize) {
      const old = saveStyle(resize, ['overflow', 'height', 'maxHeight', 'width', 'maxWidth']);
      resize.style.overflow = 'visible';
      resize.style.height = 'auto';
      resize.style.maxHeight = 'none';
      resize.style.width = 'auto';
      resize.style.maxWidth = 'none';
      restores.push(() => restoreStyle(resize, old));
    }

    const wrapper = codeBlock.querySelector('.resizable-wrapper');
    if (wrapper) {
      const old = saveStyle(wrapper, ['overflow', 'height', 'maxHeight', 'width', 'maxWidth']);
      wrapper.style.overflow = 'visible';
      wrapper.style.height = 'auto';
      wrapper.style.maxHeight = 'none';
      wrapper.style.width = 'auto';
      wrapper.style.maxWidth = 'none';
      restores.push(() => restoreStyle(wrapper, old));
    }

    const oldCodeBlock = saveStyle(codeBlock, [
      'overflow',
      'width',
      'maxWidth',
      'height',
      'maxHeight',
      'padding',
      'margin'
    ]);
    codeBlock.style.overflow = 'visible';
    codeBlock.style.width = codeBlock.scrollWidth + 'px';
    codeBlock.style.maxWidth = 'none';
    codeBlock.style.height = codeBlock.scrollHeight + 'px';
    codeBlock.style.maxHeight = 'none';
    restores.push(() => restoreStyle(codeBlock, oldCodeBlock));

    return () => {
      restores.reverse().forEach(fn => fn());
    };
  }

  function filterNode(node) {
    if (!(node instanceof HTMLElement)) return true;

    if (node.classList.contains('feishu-copy-image-btn')) return false;
    if (node.classList.contains('code-block-header-toolbar')) return false;
    if (node.classList.contains('draggable-btn')) return false;
    if (node.classList.contains('code-block-header-btn-con')) return false;
    if (node.classList.contains('code-wrap')) return false;
    if (node.classList.contains('code-copy')) return false;

    return true;
  }

  async function writeBlobToClipboard(blob) {
    if (!blob) throw new Error('图片生成失败');
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error('当前浏览器不支持图片写入剪贴板');
    }
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type || 'image/png']: blob })
    ]);
  }

  async function copyNodeAsImage(codeBlock, button) {
    let restore = null;

    try {
      button.disabled = true;
      button.textContent = '处理中...';

      await ensureLib();

      restore = prepareForCapture(codeBlock, button);

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const rect = codeBlock.getBoundingClientRect();
      const width = Math.ceil(Math.max(rect.width, codeBlock.scrollWidth));
      const height = Math.ceil(Math.max(rect.height, codeBlock.scrollHeight));

      const blob = await window.htmlToImage.toBlob(codeBlock, {
        pixelRatio: 1.2,
        backgroundColor: '#ffffff',
        skipFonts: true,
        cacheBust: false,
        width,
        height,
        filter: filterNode
      });

      restore && restore();
      restore = null;

      await writeBlobToClipboard(blob);
      toast('已复制为图片');
    } catch (err) {
      if (restore) restore();
      console.error(err);
      toast(`复制失败：${err.message || err}`, true);
    } finally {
      button.disabled = false;
      button.textContent = '📸 图片';
    }
  }

  function addButton(codeBlock) {
    if (!codeBlock || codeBlock.getAttribute(ENHANCED_ATTR) === '1') return;
    codeBlock.setAttribute(ENHANCED_ATTR, '1');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'feishu-copy-image-btn';
    button.textContent = '📸 图片';

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyNodeAsImage(codeBlock, button);
    });

    const currentPosition = getComputedStyle(codeBlock).position;
    if (currentPosition === 'static') {
      codeBlock.style.position = 'relative';
    }

    codeBlock.appendChild(button);
  }

  function scan() {
    ensureStyle();
    getCodeBlocks().forEach(addButton);
  }

  const observer = new MutationObserver(scan);

  function boot() {
    scan();
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    setInterval(scan, 2000);
    console.log('[飞书代码块复制为图片] 保留代码块标题版已启动');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();