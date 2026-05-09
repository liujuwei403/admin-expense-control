// 一次性迁移脚本：将旧 8 态进度值迁移到新 3 态
// 运行方式：TEABLE_TOKEN=真实token node migrate-states.js

const TEABLE_BASE  = 'https://yach-teable.zhiyinlou.com';
const TEABLE_TOKEN = process.env.TEABLE_TOKEN || '';
const TABLE_LEDGER = 'tbluIKIuJRIXIVbfPYM';
const HEADERS = {
  Authorization: `Bearer ${TEABLE_TOKEN}`,
  'Content-Type': 'application/json',
};

// 旧状态 → 新状态映射
const STATE_MAP = {
  '待预提':   '费控提报中',
  '预提完成': '费控提报中',
  '待收账单': '费控提报中',
  '已收账单': '费控提报中',
  '待付款':   '费控提报完成',
  '已付款':   '费控提报完成',
};

async function main() {
  if (!TEABLE_TOKEN) {
    console.error('请设置环境变量 TEABLE_TOKEN，例如：TEABLE_TOKEN=xxx node migrate-states.js');
    process.exit(1);
  }

  console.log('正在拉取台账数据...');
  const res = await fetch(
    `${TEABLE_BASE}/api/table/${TABLE_LEDGER}/record?fieldKeyType=name&take=1000`,
    { headers: HEADERS }
  );
  if (!res.ok) { console.error('拉取失败:', await res.text()); process.exit(1); }

  const records = (await res.json()).records || [];
  const toUpdate = records.filter(r => STATE_MAP[r.fields['当前进度']]);
  console.log(`共 ${records.length} 条记录，需迁移 ${toUpdate.length} 条\n`);

  let ok = 0, fail = 0;
  for (const r of toUpdate) {
    const oldState = r.fields['当前进度'];
    const newState = STATE_MAP[oldState];
    const resp = await fetch(`${TEABLE_BASE}/api/table/${TABLE_LEDGER}/record`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({
        fieldKeyType: 'name',
        typecast: true,
        records: [{ id: r.id, fields: { '当前进度': newState } }],
      }),
    });
    if (resp.ok) {
      console.log(`  ✓ #${r.fields['编号']}  ${oldState}  →  ${newState}`);
      ok++;
    } else {
      console.error(`  ✗ #${r.fields['编号']}  失败:`, await resp.text());
      fail++;
    }
    await new Promise(resolve => setTimeout(resolve, 120)); // 避免触发速率限制
  }

  console.log(`\n迁移完成：${ok} 成功，${fail} 失败`);
}

main().catch(console.error);
