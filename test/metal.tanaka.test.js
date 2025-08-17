jest.mock('node-fetch', () => jest.fn());
const fetch = require('node-fetch');

describe('TanakaProvider getGoldJPYPerGram', () => {
  beforeEach(() => {
    fetch.mockReset();
  });

  it('parses JPY per gram for gold from typical table layout', async () => {
    const html = `
      <table>
        <tr><th>金</th><td>9,999</td></tr>
      </table>
    `;
    fetch.mockResolvedValue({ ok: true, text: async () => html });

    const { getGoldJPYPerGram } = require('../providers/metal/TanakaProvider');
    const data = await getGoldJPYPerGram();
    expect(data).toEqual(
      expect.objectContaining({ metal: 'gold', price_jpy_per_g: 9999 })
    );
  });

  it('handles whitespace/newlines between cells', async () => {
    const html = `
      <table>
        <tr>
          <th> 金 </th>
          <td> 7,123.45 </td>
        </tr>
      </table>
    `;
    fetch.mockResolvedValue({ ok: true, text: async () => html });

    const { getGoldJPYPerGram } = require('../providers/metal/TanakaProvider');
    const data = await getGoldJPYPerGram();
    expect(data.price_jpy_per_g).toBeCloseTo(7123.45, 2);
  });
});
