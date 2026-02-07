(function () {
  const script = document.currentScript;
  const botId = script.getAttribute('data-bot-id');

  if (!botId) {
    console.error('AI Widget: data-bot-id is required');
    return;
  }

  const APP_URL = new URL(script.src).origin;

  async function init() {
    let primaryColor = script.getAttribute('data-color') || '#000000';
    const position = script.getAttribute('data-position') || 'right';

    // Fetch live configuration from backend
    try {
      const response = await fetch(`${APP_URL}/api/bots/${botId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.primaryColor) {
          primaryColor = data.primaryColor;
        }
      }
    } catch (e) {
      console.error('AI Widget: Failed to fetch bot config', e);
    }

    // Create Styles
    const style = document.createElement('style');
    style.innerHTML = `
         #ai-widget-container {
             position: fixed;
             bottom: 30px;
             ${position}: 30px;
             z-index: 999999;
             font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         }
         #ai-widget-bubble {
             width: 64px;
             height: 64px;
             border-radius: 50%;
             background-color: ${primaryColor};
             box-shadow: 0 8px 32px rgba(0,0,0,0.2);
             cursor: pointer;
             display: flex;
             align-items: center;
             justify-content: center;
             transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
             border: 2px solid rgba(255,255,255,0.1);
         }
         #ai-widget-bubble:hover {
             transform: scale(1.1) translateY(-5px);
             box-shadow: 0 12px 40px rgba(0,0,0,0.3);
         }
         #ai-widget-bubble svg {
             width: 32px;
             height: 32px;
             fill: white;
             transition: all 0.3s ease;
         }
         #ai-widget-iframe-container {
             display: none;
             position: fixed;
             bottom: 110px;
             ${position}: 30px;
             width: 420px;
             height: 650px;
             max-width: calc(100vw - 60px);
             max-height: calc(100vh - 160px);
             border-radius: 24px;
             overflow: hidden;
             box-shadow: 0 20px 48px rgba(0,0,0,0.25);
             background: white;
             z-index: 999999;
             opacity: 0;
             transform: translateY(20px) scale(0.95);
             transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.1);
             transform-origin: bottom ${position};
         }
         #ai-widget-iframe-container.open {
             display: block;
             opacity: 1;
             transform: translateY(0) scale(1);
         }
         @media (max-width: 480px) {
             #ai-widget-container {
                 bottom: 20px;
                 ${position}: 20px;
             }
             #ai-widget-bubble {
                 width: 56px;
                 height: 56px;
             }
             #ai-widget-iframe-container {
                 bottom: 0;
                 ${position}: 0;
                 width: 100vw;
                 height: 100vh;
                 max-width: 100vw;
                 max-height: 100vh;
                 border-radius: 0;
             }
             #ai-widget-iframe-container.open {
                 bottom: 0px;
             }
             #ai-widget-iframe-container.open ~ #ai-widget-bubble {
                 display: none;
             }
         }
    `;
    document.head.appendChild(style);

    // Create Widget DOM
    const container = document.createElement('div');
    container.id = 'ai-widget-container';

    const bubble = document.createElement('div');
    bubble.id = 'ai-widget-bubble';
    bubble.style.zIndex = '1000000';
    const chatIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.821.487 3.53 1.338 5L2 22l5-1.338c1.47.851 3.179 1.338 5 1.338 5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18c-1.476 0-2.859-.41-4.04-1.12l-.273-.162-2.97.796.796-2.97-.162-.273A7.957 7.957 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z"/>
        </svg>`;
    const closeIcon = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
        </svg>`;
    bubble.innerHTML = chatIcon;

    const iframeContainer = document.createElement('div');
    iframeContainer.id = 'ai-widget-iframe-container';

    const iframe = document.createElement('iframe');
    iframe.src = `${APP_URL}/widget/${botId}?isWidget=true`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    iframeContainer.appendChild(iframe);
    container.appendChild(iframeContainer);
    container.appendChild(bubble);
    document.body.appendChild(container);

    // Toggle Logic
    let isOpen = false;
    const toggle = function () {
      isOpen = !isOpen;
      if (isOpen) {
        iframeContainer.classList.add('open');
        bubble.innerHTML = closeIcon;
        bubble.style.transform = 'rotate(90deg)';
        setTimeout(() => {
          bubble.style.transform = 'rotate(0deg)';
        }, 300);
      } else {
        iframeContainer.classList.remove('open');
        bubble.innerHTML = chatIcon;
        bubble.style.transform = 'rotate(-90deg)';
        setTimeout(() => {
          bubble.style.transform = 'rotate(0deg)';
        }, 300);
      }
    };

    bubble.onclick = toggle;

    // Listen for close message from iframe
    window.addEventListener('message', event => {
      if (event.data === 'closeWidget') {
        toggle();
      }
    });
  }

  init();
})();
