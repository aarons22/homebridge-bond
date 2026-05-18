const elements = {
  status: document.getElementById('connection-status'),
  ipAddress: document.getElementById('ip-address'),
  bondId: document.getElementById('bond-id'),
  firmware: document.getElementById('firmware'),
  token: document.getElementById('token'),
  deviceControls: document.getElementById('device-controls'),
};
const previousExternalUpdates = new Map();
let hasRendered = false;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

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
    generic: device.type === 'GX',
    shade: device.type === 'MS',
    fireplace: device.type === 'FP',
    speed: device.actions.includes('SetSpeed'),
    speedButtons: device.actions.includes('IncreaseSpeed') && device.actions.includes('DecreaseSpeed'),
    direction: device.actions.includes('ToggleDirection'),
    light: device.actions.includes('ToggleLight'),
    upDownLight: device.actions.includes('ToggleUpLight') && device.actions.includes('ToggleDownLight'),
    setBrightness: device.actions.includes('SetBrightness'),
    dimmer: device.actions.includes('StartDimmer') && device.actions.includes('Stop'),
    upDownDimmer: device.actions.includes('StartUpLightDimmer') && device.actions.includes('StartDownLightDimmer') && device.actions.includes('Stop'),
    brightnessButtons: device.actions.includes('StartIncreasingBrightness') && device.actions.includes('StartDecreasingBrightness') && device.actions.includes('Stop'),
    position: device.actions.includes('SetPosition'),
    preset: device.actions.includes('Preset'),
    flame: device.actions.includes('SetFlame'),
    togglePower: device.actions.includes('TogglePower'),
  };
}

function renderActionButton(device, action, label, extraClass = '') {
  return `
    <button class="action-button ${extraClass}" data-action="bond-action" data-bond-action="${action}" data-device-id="${device.id}" type="button">
      <span>${label}</span>
    </button>
  `;
}

function renderToggleControl(device, action, label, checked, stateLabel = checked ? 'On' : 'Off') {
  return `
    <button class="toggle-control" data-action="bond-action" data-bond-action="${action}" data-device-id="${device.id}" type="button" aria-pressed="${checked}">
      <span class="toggle-label">${label}</span>
      <span class="toggle-switch" aria-hidden="true"></span>
      <span class="toggle-state">${stateLabel}</span>
    </button>
  `;
}

function renderControlSection(title, controls) {
  if (!controls.trim()) {
    return '';
  }

  return `
    <section class="component-section">
      <h3>${title}</h3>
      <div class="control-stack">
        ${controls}
      </div>
    </section>
  `;
}

function devicePowerState(device, capabilities) {
  if (capabilities.shade) {
    return device.state.open === 1;
  }
  if (capabilities.light && !capabilities.fan) {
    return device.state.light === 1;
  }
  return device.state.power === 1;
}

function renderBrightnessSlider(device) {
  const brightness = device.state.brightness ?? 0;

  return `
    <label class="slider-control">
      <span>Brightness</span>
      <strong>${brightness}%</strong>
      <input data-action="brightness" data-device-id="${device.id}" type="range" min="0" max="100" value="${brightness}">
    </label>
  `;
}

function renderSingleLightSection(device, capabilities, title = 'Light') {
  const lightOn = device.state.light === 1;

  if (!capabilities.light) {
    return '';
  }

  const controls = `
    ${renderToggleControl(device, 'ToggleLight', 'Light', lightOn)}
    ${capabilities.setBrightness ? renderBrightnessSlider(device) : ''}
    ${capabilities.dimmer ? `
      <div class="button-row">
        ${renderActionButton(device, 'StartDimmer', 'Start Dimmer', 'secondary-button')}
        ${renderActionButton(device, 'Stop', 'Stop Dimmer', 'secondary-button')}
      </div>
    ` : ''}
    ${capabilities.brightnessButtons ? `
      <div class="button-row">
        ${renderActionButton(device, 'StartIncreasingBrightness', 'Brighten', 'secondary-button')}
        ${renderActionButton(device, 'StartDecreasingBrightness', 'Dim', 'secondary-button')}
      </div>
      ${renderActionButton(device, 'Stop', 'Stop Brightness', 'secondary-button')}
    ` : ''}
  `;

  return renderControlSection(title, controls);
}

function renderSplitLightSections(device, capabilities) {
  if (!capabilities.upDownLight) {
    return renderSingleLightSection(device, capabilities);
  }

  const upLightControls = `
    ${renderToggleControl(device, 'ToggleUpLight', 'Power', device.state.up_light === 1)}
    ${capabilities.upDownDimmer ? `
      <div class="button-row">
        ${renderActionButton(device, 'StartUpLightDimmer', 'Start Dimmer', 'secondary-button')}
        ${renderActionButton(device, 'Stop', 'Stop Dimmer', 'secondary-button')}
      </div>
    ` : ''}
  `;
  const downLightControls = `
    ${renderToggleControl(device, 'ToggleDownLight', 'Power', device.state.down_light === 1)}
    ${capabilities.upDownDimmer ? `
      <div class="button-row">
        ${renderActionButton(device, 'StartDownLightDimmer', 'Start Dimmer', 'secondary-button')}
        ${renderActionButton(device, 'Stop', 'Stop Dimmer', 'secondary-button')}
      </div>
    ` : ''}
  `;

  return [
    renderControlSection('Up Light', upLightControls),
    renderControlSection('Down Light', downLightControls),
  ].join('');
}

function renderFanControls(device, capabilities) {
  const powerOn = device.state.power === 1;
  const speed = device.state.speed ?? 1;
  const maxSpeed = device.properties.max_speed ?? 6;

  const fanControls = `
    ${renderToggleControl(device, powerOn ? 'TurnOff' : 'TurnOn', 'Power', powerOn)}
    ${capabilities.speed ? `
      <label class="slider-control">
        <span>Speed</span>
        <strong>${speed} / ${maxSpeed}</strong>
        <input data-action="speed" data-device-id="${device.id}" type="range" min="0" max="${maxSpeed}" value="${speed}">
      </label>
    ` : ''}
    ${capabilities.speedButtons ? `
      <div class="button-row">
        ${renderActionButton(device, 'DecreaseSpeed', 'Speed Down', 'secondary-button')}
        ${renderActionButton(device, 'IncreaseSpeed', 'Speed Up', 'secondary-button')}
      </div>
    ` : ''}
    ${capabilities.direction ? renderToggleControl(device, 'ToggleDirection', 'Direction', device.state.direction === -1, device.state.direction === 1 ? 'Forward' : 'Reverse') : ''}
  `;

  return [
    renderControlSection('Fan', fanControls),
    renderSplitLightSections(device, capabilities),
  ].join('');
}

function renderShadeControls(device, capabilities) {
  const open = device.state.open === 1;
  const position = device.state.position ?? (open ? 0 : 100);

  return renderControlSection('Shade', `
    ${renderToggleControl(device, 'ToggleOpen', 'Open', open, open ? 'Open' : 'Closed')}
    ${capabilities.position ? `
      <label class="slider-control">
        <span>Position</span>
        <strong>${position}%</strong>
        <input data-action="position" data-device-id="${device.id}" type="range" min="0" max="100" value="${position}">
      </label>
    ` : ''}
    ${capabilities.preset ? renderActionButton(device, 'Preset', 'Preset', 'secondary-button') : ''}
  `);
}

function renderFireplaceControls(device, capabilities) {
  const powerOn = device.state.power === 1;
  const flame = device.state.flame ?? 0;

  return renderControlSection('Fireplace', `
    ${renderToggleControl(device, 'TogglePower', 'Power', powerOn)}
    ${capabilities.flame ? `
      <label class="slider-control">
        <span>Flame</span>
        <strong>${flame}%</strong>
        <input data-action="flame" data-device-id="${device.id}" type="range" min="0" max="100" value="${flame}">
      </label>
    ` : ''}
  `);
}

function renderGenericControls(device) {
  const powerOn = device.state.power === 1;

  return renderControlSection('Power', renderToggleControl(device, 'TogglePower', 'Power', powerOn));
}

function deviceTypeLabel(type) {
  return {
    LT: 'Lights',
    CF: 'Fans',
    MS: 'Shades',
    FP: 'Fireplaces',
    GX: 'Generic',
  }[type] ?? 'Other';
}

function renderDeviceState(device) {
  const state = Object.entries(device.state)
    .map(([key, value]) => `<span><b>${escapeHtml(key)}</b>${escapeHtml(value)}</span>`)
    .join('');

  return `<div class="state-pills">${state}</div>`;
}

function renderDeviceControl(device, highlight) {
  const capabilities = deviceCapabilities(device);
  const isOn = devicePowerState(device, capabilities);
  const controls = capabilities.shade
    ? renderShadeControls(device, capabilities)
    : capabilities.fireplace ? renderFireplaceControls(device, capabilities)
    : capabilities.fan ? renderFanControls(device, capabilities)
    : capabilities.generic ? renderGenericControls(device) : renderSingleLightSection(device, capabilities);

  return `
    <article class="panel control-panel ${isOn ? 'is-on' : 'is-off'} ${highlight ? 'external-update' : ''}" data-device-id="${device.id}">
      <div class="device-heading">
        <div class="device-title-row">
          <h2>${device.name}</h2>
          ${highlight ? '<span class="update-badge">Updated</span>' : ''}
        </div>
        <p class="device-meta">${device.id} · ${device.type}${device.subtype ? ` · ${device.subtype}` : ''}</p>
        ${renderDeviceState(device)}
      </div>
      ${controls}
    </article>
  `;
}

function renderDeviceGroup(type, devices, highlights) {
  return `
    <section class="device-section">
      <div class="section-heading">
        <h2>${deviceTypeLabel(type)}</h2>
        <span>${devices.length}</span>
      </div>
      <div class="device-grid">
        ${devices.map(device => renderDeviceControl(device, highlights.has(device.id))).join('')}
      </div>
    </section>
  `;
}

function render(status) {
  const highlights = new Set();
  const grouped = status.devices.reduce((acc, device) => {
    if (!acc.has(device.type)) {
      acc.set(device.type, []);
    }
    acc.get(device.type).push(device);

    if (
      hasRendered
      && device.lastUpdatedBy === 'external'
      && device.lastUpdatedAt > (previousExternalUpdates.get(device.id) ?? 0)
    ) {
      highlights.add(device.id);
    }
    if (device.lastUpdatedBy === 'external') {
      previousExternalUpdates.set(device.id, device.lastUpdatedAt);
    }

    return acc;
  }, new Map());
  const typeOrder = ['LT', 'CF', 'MS', 'FP', 'GX'];

  elements.status.textContent = 'Online';
  elements.status.className = 'status online';
  elements.ipAddress.textContent = status.homebridgeConfig.bonds[0].ip_address;
  elements.bondId.textContent = status.version.bondid;
  elements.firmware.textContent = status.version.fw_ver;
  elements.token.textContent = status.token;
  elements.deviceControls.innerHTML = typeOrder
    .filter(type => grouped.has(type))
    .map(type => renderDeviceGroup(type, grouped.get(type), highlights))
    .join('');
  hasRendered = true;
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

elements.deviceControls.addEventListener('change', async (event) => {
  const slider = event.target.closest('[data-action="flame"]');
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
        action: 'SetFlame',
        argument: Number(slider.value),
      }),
    }));
  } finally {
    slider.disabled = false;
  }
});

refresh();
setInterval(refresh, 3000);
