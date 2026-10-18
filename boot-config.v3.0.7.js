if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(error => {
        console.error('Offline setup failed:', error);
      });
    }
