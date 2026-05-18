const elements = {
  status: document.getElementById('connection-status'),
  bondId: document.getElementById('bond-id'),
  firmware: document.getElementById('firmware'),
  token: document.getElementById('token'),
  deviceControls: document.getElementById('device-controls'),
  deviceList: document.getElementById('device-list'),
  homebridgeConfig: document.getElementById('homebridge-config'),
};

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function deviceCapabilities(device) {
  return {
    brightness: device.actions.includes('SetBrightness') && device.actions.includes('TurnLightOff'),
  };
}

function renderDeviceControl(device) {
  const lightOn = device.state.light === 1;
  const capabilities = deviceCapabilities(device);
  const brightness = device.state.brightness ?? 0;

  return `
    <article class="panel control-panel">
      <div class="device-heading">
        <p class="label">${device.location}</p>
        <h2>${device.name}</h2>
        <p class="device-meta">${device.id} · ${device.type}</p>
      </div>
      <button class="power-button" data-action="toggle" data-device-id="${device.id}" type="button" aria-pressed="${lightOn}">
        <span class="power-icon"></span>
        <span>${lightOn ? 'Turn Off' : 'Turn On'}</span>
      </button>
      ${capabilities.brightness ? `
        <label class="slider-control">
          <span>Brightness</span>
          <strong>${brightness}%</strong>
          <input data-action="brightness" data-device-id="${device.id}" type="range" min="1" max="100" value="${brightness}">
        </label>
      ` : ''}
    </article>
  `;
}

function renderDeviceSummary(device) {
  const actions = device.actions.join(', ');
  const state = Object.entries(device.state)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  return `
    <div class="device-summary">
      <strong>${device.name}</strong>
      <span>${device.id} · ${actions}</span>
      <span>${state}</span>
    </div>
  `;
}

function render(status) {
  elements.status.textContent = 'Online';
  elements.status.className = 'status online';
  elements.bondId.textContent = status.version.bondid;
  elements.firmware.textContent = status.version.fw_ver;
  elements.token.textContent = status.token;
  elements.deviceControls.innerHTML = status.devices.map(renderDeviceControl).join('');
  elements.deviceList.innerHTML = status.devices.map(renderDeviceSummary).join('');
  elements.homebridgeConfig.textContent = JSON.stringify(status.homebridgeConfig, null, 2);
}

async function refresh() {
  try {
    render(await request('/simulator/status'));
  } catch (error) {
    elements.status.textContent = 'Offline';
    elements.status.className = 'status error';
  }
}

elements.deviceControls.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="toggle"]');
  if (!button) {
    return;
  }

  button.disabled = true;
  try {
    render(await request(`/simulator/toggle?id=${button.dataset.deviceId}`, { method: 'PUT' }));
  } finally {
    button.disabled = false;
  }
});

elements.deviceControls.addEventListener('change', async (event) => {
  const slider = event.target.closest('[data-action="brightness"]');
  if (!slider) {
    return;
  }

  slider.disabled = true;
  try {
    render(await request('/simulator/brightness', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: slider.dataset.deviceId,
        brightness: Number(slider.value),
      }),
    }));
  } finally {
    slider.disabled = false;
  }
});

refresh();
setInterval(refresh, 3000);
