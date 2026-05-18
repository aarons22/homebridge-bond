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
    fan: device.type === 'CF',
    shade: device.type === 'MS',
    speed: device.actions.includes('SetSpeed'),
    speedButtons: device.actions.includes('IncreaseSpeed') && device.actions.includes('DecreaseSpeed'),
    direction: device.actions.includes('ToggleDirection'),
    light: device.actions.includes('ToggleLight'),
    upDownLight: device.actions.includes('ToggleUpLight') && device.actions.includes('ToggleDownLight'),
    brightness: device.actions.includes('SetBrightness') && device.actions.includes('TurnLightOff'),
    position: device.actions.includes('SetPosition'),
    preset: device.actions.includes('Preset'),
  };
}

function renderActionButton(device, action, label, pressed = false, extraClass = '') {
  return `
    <button class="power-button ${extraClass}" data-action="bond-action" data-bond-action="${action}" data-device-id="${device.id}" type="button" aria-pressed="${pressed}">
      <span>${label}</span>
    </button>
  `;
}

function renderLightControls(device, capabilities) {
  const lightOn = device.state.light === 1;
  const brightness = device.state.brightness ?? 0;

  if (capabilities.upDownLight) {
    return `
      <div class="button-row">
        ${renderActionButton(device, 'ToggleUpLight', device.state.up_light === 1 ? 'Up Light Off' : 'Up Light On', device.state.up_light === 1)}
        ${renderActionButton(device, 'ToggleDownLight', device.state.down_light === 1 ? 'Down Light Off' : 'Down Light On', device.state.down_light === 1)}
      </div>
    `;
  }

  if (!capabilities.light) {
    return '';
  }

  return `
    ${renderActionButton(device, 'ToggleLight', lightOn ? 'Light Off' : 'Light On', lightOn)}
    ${capabilities.brightness ? `
      <label class="slider-control">
        <span>Brightness</span>
        <strong>${brightness}%</strong>
        <input data-action="brightness" data-device-id="${device.id}" type="range" min="1" max="100" value="${brightness}">
      </label>
    ` : ''}
  `;
}

function renderFanControls(device, capabilities) {
  const powerOn = device.state.power === 1;
  const speed = device.state.speed ?? 1;
  const maxSpeed = device.properties.max_speed ?? 6;

  return `
    ${renderActionButton(device, powerOn ? 'TurnOff' : 'TurnOn', powerOn ? 'Turn Off' : 'Turn On', powerOn)}
    ${capabilities.speed ? `
      <label class="slider-control">
        <span>Speed</span>
        <strong>${speed} / ${maxSpeed}</strong>
        <input data-action="speed" data-device-id="${device.id}" type="range" min="1" max="${maxSpeed}" value="${speed}">
      </label>
    ` : ''}
    ${capabilities.speedButtons ? `
      <div class="button-row">
        ${renderActionButton(device, 'DecreaseSpeed', 'Speed Down', false, 'secondary-button')}
        ${renderActionButton(device, 'IncreaseSpeed', 'Speed Up', false, 'secondary-button')}
      </div>
    ` : ''}
    ${capabilities.direction ? renderActionButton(device, 'ToggleDirection', device.state.direction === 1 ? 'Reverse' : 'Forward', false, 'secondary-button') : ''}
    ${renderLightControls(device, capabilities)}
  `;
}

function renderShadeControls(device, capabilities) {
  const open = device.state.open === 1;
  const position = device.state.position ?? (open ? 0 : 100);

  return `
    ${renderActionButton(device, 'ToggleOpen', open ? 'Close' : 'Open', open)}
    ${capabilities.position ? `
      <label class="slider-control">
        <span>Position</span>
        <strong>${position}%</strong>
        <input data-action="position" data-device-id="${device.id}" type="range" min="0" max="100" value="${position}">
      </label>
    ` : ''}
    ${capabilities.preset ? renderActionButton(device, 'Preset', 'Preset', false, 'secondary-button') : ''}
  `;
}

function renderDeviceControl(device) {
  const capabilities = deviceCapabilities(device);
  const controls = capabilities.shade
    ? renderShadeControls(device, capabilities)
    : capabilities.fan ? renderFanControls(device, capabilities) : renderLightControls(device, capabilities);

  return `
    <article class="panel control-panel">
      <div class="device-heading">
        <p class="label">${device.location}</p>
        <h2>${device.name}</h2>
        <p class="device-meta">${device.id} · ${device.type}</p>
      </div>
      ${controls}
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
  const button = event.target.closest('[data-action="bond-action"]');
  if (!button) {
    return;
  }

  button.disabled = true;
  try {
    render(await request('/simulator/action', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: button.dataset.deviceId,
        action: button.dataset.bondAction,
      }),
    }));
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

elements.deviceControls.addEventListener('change', async (event) => {
  const slider = event.target.closest('[data-action="speed"]');
  if (!slider) {
    return;
  }

  slider.disabled = true;
  try {
    render(await request('/simulator/action', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: slider.dataset.deviceId,
        action: 'SetSpeed',
        argument: Number(slider.value),
      }),
    }));
  } finally {
    slider.disabled = false;
  }
});

elements.deviceControls.addEventListener('change', async (event) => {
  const slider = event.target.closest('[data-action="position"]');
  if (!slider) {
    return;
  }

  slider.disabled = true;
  try {
    render(await request('/simulator/action', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: slider.dataset.deviceId,
        action: 'SetPosition',
        argument: Number(slider.value),
      }),
    }));
  } finally {
    slider.disabled = false;
  }
});

refresh();
setInterval(refresh, 3000);
