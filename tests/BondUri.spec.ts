import { expect } from 'chai';
import 'mocha';
import { Action } from '../src/enum/Action';
import { BondUri } from '../src/BondUri';

describe('BondUri', () => {
  const IP = '192.168.1.100';
  let uri: BondUri;

  beforeEach(() => {
    uri = new BondUri(IP);
  });

  it('version() returns correct URL', () => {
    expect(uri.version()).to.equal(`http://${IP}/v2/sys/version`);
  });

  it('deviceIds() returns correct URL', () => {
    expect(uri.deviceIds()).to.equal(`http://${IP}/v2/devices`);
  });

  it('device(id) returns correct URL', () => {
    expect(uri.device('abc123')).to.equal(`http://${IP}/v2/devices/abc123`);
  });

  it('state(id) returns correct URL', () => {
    expect(uri.state('abc123')).to.equal(`http://${IP}/v2/devices/abc123/state`);
  });

  it('action(id, action) returns correct URL', () => {
    expect(uri.action('abc123', Action.TurnOn)).to.equal(`http://${IP}/v2/devices/abc123/actions/TurnOn`);
  });

  it('action(id, SetSpeed) returns correct URL', () => {
    expect(uri.action('abc123', Action.SetSpeed)).to.equal(`http://${IP}/v2/devices/abc123/actions/SetSpeed`);
  });

  it('commands(id) returns correct URL', () => {
    expect(uri.commands('abc123')).to.equal(`http://${IP}/v2/devices/abc123/commands`);
  });

  it('command(deviceId, commandId) returns correct URL', () => {
    expect(uri.command('abc123', 'cmd1')).to.equal(`http://${IP}/v2/devices/abc123/commands/cmd1`);
  });

  it('properties(id) returns correct URL', () => {
    expect(uri.properties('abc123')).to.equal(`http://${IP}/v2/devices/abc123/properties`);
  });

  it('works with IP that includes port', () => {
    const uriWithPort = new BondUri('192.168.1.100:8080');
    expect(uriWithPort.deviceIds()).to.equal('http://192.168.1.100:8080/v2/devices');
  });

  it('different device IDs produce different URLs', () => {
    expect(uri.device('aaa')).to.not.equal(uri.device('bbb'));
  });
});
