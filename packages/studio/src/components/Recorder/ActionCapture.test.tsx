import { fireEvent, render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import ActionCapture from './ActionCapture';

describe('ActionCapture', () => {
  test('captures browser clicks, input, selection, and control keys', () => {
    const onAction = vi.fn();
    render(<ActionCapture isRecording={true} onAction={onAction} />);

    const button = document.createElement('button');
    button.id = 'submit';
    document.body.append(button);
    fireEvent.click(button);

    const input = document.createElement('input');
    input.id = 'query';
    document.body.append(input);
    fireEvent.input(input, { target: { value: 'hello' } });

    const select = document.createElement('select');
    select.id = 'country';
    const option = document.createElement('option');
    option.value = 'ru';
    select.append(option);
    document.body.append(select);
    fireEvent.change(select, { target: { value: 'ru' } });

    const panel = document.createElement('div');
    panel.id = 'panel';
    document.body.append(panel);
    fireEvent.keyDown(panel, { key: 'Escape' });

    expect(onAction).toHaveBeenCalledTimes(4);
    expect(onAction.mock.calls.map(([action]) => action.type)).toEqual([
      'click',
      'input',
      'select',
      'keypress',
    ]);
    expect(onAction.mock.calls[2][0].value).toBe('ru');
    expect(onAction.mock.calls[3][0].value).toBe('Escape');
  });

  test('does not capture password values or repeated keydown events', () => {
    const onAction = vi.fn();
    render(<ActionCapture isRecording={true} onAction={onAction} />);

    const password = document.createElement('input');
    password.type = 'password';
    document.body.append(password);
    fireEvent.input(password, { target: { value: 'secret' } });

    const panel = document.createElement('div');
    document.body.append(panel);
    fireEvent.keyDown(panel, { key: 'ArrowDown', repeat: true });

    expect(onAction).not.toHaveBeenCalled();
  });
});
