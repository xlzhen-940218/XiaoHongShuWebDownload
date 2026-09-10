(async () => {
  console.log('[AutoDownloader] 动态流与多图连续捕获模式启动...');

  // ================= 辅助函数：拟人化随机延时 =================
  const randomSleep = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((resolve) => setTimeout(resolve, ms));
  };

  // ================= 1. 全局监听拦截器 (针对视频) =================
  const downloadedVideoUrls = new Set();
  let currentItemVideoFound = false;

  async function downloadVideoByBlob(cleanUrl) {
    const filename = cleanUrl.split('/').pop().split('?')[0] || `video_${Date.now()}.mp4`;
    console.log('[AutoDownloader] 捕获到视频，拉取流:', filename);

    try {
      const response = await fetch(cleanUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = filename;

      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        a.remove();
      }, 3000);

      console.log('[AutoDownloader] 视频下载已触发:', filename);
      currentItemVideoFound = true;
    } catch (err) {
      console.warn('[AutoDownloader] Blob 限制，降级新标签页打开:', err);
      const a = document.createElement('a');
      a.href = cleanUrl;
      a.download = filename;
      a.target = '_blank';
      a.click();
      currentItemVideoFound = true;
    }
  }

  function handleVideoUrl(url) {
    if (!url || typeof url !== 'string') return;
    let cleanUrl = url.trim();
    try {
      cleanUrl = new URL(cleanUrl, window.location.href).href;
    } catch {
      return;
    }

    if (!cleanUrl.toLowerCase().includes('.mp4')) return;
    if (downloadedVideoUrls.has(cleanUrl)) {
      currentItemVideoFound = true;
      return;
    }

    downloadedVideoUrls.add(cleanUrl);
    downloadVideoByBlob(cleanUrl);
  }

  // 劫持 Fetch 与 XHR
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const input = args[0];
    const reqUrl = typeof input === 'string' ? input : input?.url;
    if (reqUrl) handleVideoUrl(reqUrl);
    return originalFetch.apply(this, args);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (url) handleVideoUrl(url.toString());
    return originalOpen.call(this, method, url, ...rest);
  };

  // 探查 DOM 与静音唤醒视频
  async function probeAndWakeVideo() {
    const videos = document.querySelectorAll('video, source');
    for (const el of videos) {
      const src = el.src || el.currentSrc || el.getAttribute('src');
      if (src && src.toLowerCase().includes('.mp4')) {
        handleVideoUrl(src);
        return true;
      }
    }

    const activeVideo = document.querySelector('video');
    if (activeVideo) {
      try {
        activeVideo.muted = true;
        await activeVideo.play();
      } catch (e) {
        activeVideo.click();
      }
    }

    if (activeVideo && (activeVideo.currentSrc || activeVideo.src)) {
      const realSrc = activeVideo.currentSrc || activeVideo.src;
      if (realSrc.toLowerCase().includes('.mp4')) {
        handleVideoUrl(realSrc);
        return true;
      }
    }
    return false;
  }

  // ================= 2. 连续图片下载核心逻辑 (支持多图) =================
  async function handleImageDownloadFlow() {
    let imgIndex = 1;

    while (true) {
      console.log(`🖼️ 正在处理第 ${imgIndex} 张照片...`);

      // 触发当前照片的下载
      const menuContainers = document.getElementsByClassName('context-menu-container');
      if (menuContainers.length > 0) {
        const menuItems = menuContainers[0].getElementsByClassName('menu-item');
        if (menuItems.length > 0) {
          menuItems[0].click();
          console.log(`✓ 第 ${imgIndex} 张图片已触发下载`);
        }
      }

      // 给下载动作及网络留出等待时间
      await randomSleep(2000, 3000);

      // 检测右切换按钮
      // 1. 是否存在禁止/到底状态 (arrow-controller right forbidden)
      const forbiddenBtn = document.querySelector('.arrow-controller.right.forbidden');
      if (forbiddenBtn) {
        console.log('检测到右箭头已被禁用 (已到底)，多图处理完成。');
        break;
      }

      // 2. 检测是否存在可点击的右箭头 (排除 forbidden)
      const rightArrows = document.querySelectorAll('.arrow-controller.right:not(.forbidden)');
      if (rightArrows.length > 0) {
        console.log('点击下一张照片...');
        rightArrows[0].click();
        imgIndex++;
        // 切图动画与加载等待
        await randomSleep(2000, 3000);
      } else {
        console.log('未检测到可用的下一张按钮 (仅单张图片或结构不符)，退出多图循环。');
        break;
      }
    }
  }

  // ================= 3. 主轮询循环：边滚边扫，按 href 去重 =================
  const processedHrefs = new Set();
  let noNewElementsCount = 0;
  let totalProcessed = 0;

  while (noNewElementsCount < 5) {
    // 动态获取当前页面中所有的卡片
    const currentCovers = Array.from(document.querySelectorAll('a.cover.mask.ld'));
    
    // 筛选出尚未处理过的卡片
    const pendingCovers = currentCovers.filter(el => {
      const href = el.href || el.getAttribute('href');
      return href && !processedHrefs.has(href);
    });

    if (pendingCovers.length > 0) {
      noNewElementsCount = 0; // 重置滚动无新元素计数

      for (const card of pendingCovers) {
        const href = card.href || card.getAttribute('href');
        processedHrefs.add(href);
        totalProcessed++;

        console.log(`\n▶ [总计第 ${totalProcessed} 项] 准备打开预览: ${href}`);
        currentItemVideoFound = false;

        // 平滑对齐视口
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await randomSleep(800, 1500);

        // 打开预览弹窗
        card.click();
        await randomSleep(2500, 3500);

        // 判断类型：是否有下载图片的菜单
        const isImage = document.getElementsByClassName('context-menu-container').length > 0;

        if (isImage) {
          // 执行多图处理流程
          await handleImageDownloadFlow();
        } else {
          console.log('🎬 确认为视频，正在多轮嗅探流地址...');
          for (let attempt = 0; attempt < 8; attempt++) {
            await probeAndWakeVideo();
            if (currentItemVideoFound) break;
            await randomSleep(600, 900);
          }

          if (!currentItemVideoFound) {
            console.warn('⚠️ 自动提取超时，等待人工交互...');
            alert(`视频未自动识别：\n1. 点击确定后，在画面中央手动点一下【播放】\n2. 看到开始下载后再稍等几秒`);
            
            for (let wait = 0; wait < 10; wait++) {
              await probeAndWakeVideo();
              if (currentItemVideoFound) {
                console.log('手动交互后成功捕获视频！');
                break;
              }
              await randomSleep(600, 900);
            }
          }

          // 视频写入缓冲
          await randomSleep(3000, 4000);
        }

        // 关闭弹窗
        const closeBtns = document.getElementsByClassName('close-mask-dark');
        if (closeBtns.length > 0) {
          closeBtns[0].click();
          console.log('✓ 已关闭预览');
        }

        // 项与项之间的防风控停顿
        await randomSleep(2500, 4000);
      }
    } else {
      // 当前视口内没有未处理项，向下滚动加载新内容
      console.log('当前视口内容均已处理，正在向下滚动加载新卡片...');
      const prevScrollY = window.scrollY;
      
      window.scrollBy({
        top: window.innerHeight * 0.85,
        behavior: 'smooth'
      });

      await randomSleep(2000, 3000);

      // 如果滚动位置没有发生实质改变，增加无新元素计数
      if (Math.abs(window.scrollY - prevScrollY) < 10) {
        noNewElementsCount++;
        console.log(`页面接近底部或未发生位移 (${noNewElementsCount}/5)...`);
      }
    }
  }

  console.log(`\n🎉 任务全部完成！共计扫描去重并处理了 ${totalProcessed} 项内容。`);
})();