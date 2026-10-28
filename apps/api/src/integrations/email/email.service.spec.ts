import { ConsoleEmailProvider } from './console-email.provider';

describe('ConsoleEmailProvider', () => {
  it('accepts messages', async () => {
    const provider = new ConsoleEmailProvider();
    const result = await provider.send({
      to: 'a@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
      text: 'hi',
    });
    expect(result.accepted).toBe(true);
    expect(result.provider).toBe('console');
  });
});
