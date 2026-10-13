(function () {
  const clock = document.getElementById('datetime');
  if (!clock) return;

  function tick() {
    clock.textContent = new Date().toLocaleString();
  }

  tick();
  setInterval(tick, 1000);
})();
