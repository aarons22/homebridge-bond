import { expect } from 'chai';
import 'mocha';
import sinon from 'sinon';
import { Observer } from '../src/Observer';
import { MockCharacteristic } from './helpers/hapStubs';
import { Characteristic } from 'homebridge';

describe('Observer.set', () => {
  let characteristic: MockCharacteristic;

  afterEach(() => {
    sinon.restore();
  });

  beforeEach(() => {
    characteristic = new MockCharacteristic();
  });

  it('invokes the callback when value differs from current', async () => {
    const callback = sinon.stub().resolves();
    Observer.set(characteristic as unknown as Characteristic, callback);

    characteristic.value = false;
    await characteristic.simulateSet(true);

    expect(callback.calledOnce).to.be.true;
    expect(callback.calledWith(true)).to.be.true;
  });

  it('does NOT invoke the callback when value equals current (de-dup)', async () => {
    const callback = sinon.stub().resolves();
    Observer.set(characteristic as unknown as Characteristic, callback);

    characteristic.value = true;
    await characteristic.simulateSet(true);

    expect(callback.called).to.be.false;
  });

  it('passes the exact new value to the callback', async () => {
    const callback = sinon.stub().resolves();
    Observer.set(characteristic as unknown as Characteristic, callback);

    characteristic.value = 0;
    await characteristic.simulateSet(75);

    expect(callback.calledWith(75)).to.be.true;
  });

  it('works with boolean values', async () => {
    const callback = sinon.stub().resolves();
    Observer.set(characteristic as unknown as Characteristic, callback);

    characteristic.value = undefined;
    await characteristic.simulateSet(false);

    expect(callback.calledOnce).to.be.true;
  });

  it('works with numeric values', async () => {
    const callback = sinon.stub().resolves();
    Observer.set(characteristic as unknown as Characteristic, callback);

    characteristic.value = 0;
    await characteristic.simulateSet(50);

    expect(callback.calledWith(50)).to.be.true;
  });

  it('awaits async callback before returning', async () => {
    let resolved = false;
    const callback = sinon.stub().callsFake(async () => {
      await new Promise<void>(r => setTimeout(r, 10));
      resolved = true;
    });
    Observer.set(characteristic as unknown as Characteristic, callback);

    characteristic.value = false;
    await characteristic.simulateSet(true);

    expect(resolved).to.be.true;
  });

  it('de-dups after value is updated via updateValue', async () => {
    const callback = sinon.stub().resolves();
    Observer.set(characteristic as unknown as Characteristic, callback);

    // Simulate state being updated by a getState call
    characteristic.updateValue(42);

    // Now trying to set the same value should de-dup
    await characteristic.simulateSet(42);

    expect(callback.called).to.be.false;
  });
});
