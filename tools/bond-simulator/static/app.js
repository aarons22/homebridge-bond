const elements = {
  status: document.getElementById('connection-status'),
  lightState: document.getElementById('light-state'),
  toggleLight: document.getElementById('toggle-light'),
  toggleLabel: document.getElementById('toggle-label'),
  bondId: document.getElementById('bond-id'),
  firmware: document.getElementById('firmware'),
  token: document.getElementById('token'),
  deviceId: document.getElementById('device-id'),
  deviceName: document.getElementById('device-name'),
  deviceLocation: document.getElementById('device-location'),
  deviceType: document.getElementById('device-type'),
  homebridgeConfig: document.getElementById('homebridge-config'),
};

async function request(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json();
}

function render(status) {
  const lightOn = status.device.state.light === 1;
  elements.status.textContent = 'Online';
  elements.status.className = 'status online';
  elements.lightState.textContent = lightOn ? 'On' : 'Off';
  elements.toggleLight.setAttribute('aria-pressed', String(lightOn));
  elements.toggleLabel.textContent = lightOn ? 'Turn Off' : 'Turn On';
  elements.bondId.textContent = status.version.bondid;
  elements.firmware.textContent = status.version.fw_ver;
  elements.token.textContent = status.token;
  elements.deviceId.textContent = status.device.id;
  elements.deviceName.textContent = status.device.name;
  elements.deviceLocation.textContent = status.device.location;
  elements.deviceType.textContent = status.device.type;
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

elements.toggleLight.addEventListener('click', async () => {
  elements.toggleLight.disabled = true;
  try {
    render(await request('/simulator/toggle', { method: 'PUT' }));
  } finally {
    elements.toggleLight.disabled = false;
  }
});

refresh();
setInterval(refresh, 3000);
