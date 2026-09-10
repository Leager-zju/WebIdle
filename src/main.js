const canvas = document.querySelector('#game-canvas');
const context = canvas.getContext('2d');
const status = document.querySelector('#game-status');
const resetButton = document.querySelector('#reset-button');

const keys = new Set();
const player = { x: canvas.width / 2, y: canvas.height / 2, size: 28, speed: 4 };

function reset() {
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  status.textContent = 'READY';
}

function update() {
  const horizontal = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'));
  const vertical = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'));
  player.x = Math.max(player.size, Math.min(canvas.width - player.size, player.x + horizontal * player.speed));
  player.y = Math.max(player.size, Math.min(canvas.height - player.size, player.y + vertical * player.speed));
  if (horizontal || vertical) status.textContent = 'PLAYING';
}

function draw() {
  context.fillStyle = '#11181d';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = 'rgba(139, 245, 201, .1)';
  context.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvas.height);
    context.stroke();
  }
  for (let y = 0; y < canvas.height; y += 48) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvas.width, y);
    context.stroke();
  }

  context.fillStyle = '#8bf5c9';
  context.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
  context.fillStyle = '#11181d';
  context.fillRect(player.x - 5, player.y - 5, 10, 10);
}

function frame() {
  update();
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) {
    event.preventDefault();
    keys.add(key);
  }
});
window.addEventListener('keyup', (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  keys.delete(key);
});
resetButton.addEventListener('click', reset);

reset();
frame();
