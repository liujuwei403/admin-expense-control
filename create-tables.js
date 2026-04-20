// 一次性脚本：创建行政费控提报系统的 Teable Base + 业务数据表
// 场景配置表使用参考数据 Base 中的已有表（bseRLEsbDQqPra4KxpN / tblAxpoD2Rh7PhJzJLG）
// 运行方式: node create-tables.js
const TEABLE_BASE = 'https://yach-teable.zhiyinlou.com';
const TEABLE_TOKEN = 'teable_accrGoCYgJwpCP4Hy7H_CJNj3/ERLDcxs8cNekS0vxalbXtPNbnTphkd5Qhccz8=';
const SPACE_ID = 'spc87WlhvxOSzOReHXp'; // 刘聚伟个人

async function api(path, body) {
  const res = await fetch(`${TEABLE_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TEABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { console.error('FAIL:', path, data); process.exit(1); }
  return data;
}

function sel(name, choices) {
  return {
    name,
    type: 'singleSelect',
    options: { choices: choices.map(c => ({ name: c })) },
  };
}

async function main() {
  // 1. 创建 Base
  console.log('Creating Base...');
  const base = await api(`/api/base`, { spaceId: SPACE_ID, name: '行政费控提报系统' });
  const BASE_ID = base.id;
  console.log('  BASE_ID:', BASE_ID);

  // 2. 费用台账主表
  console.log('\nCreating 费用台账主表...');
  const t1 = await api(`/api/base/${BASE_ID}/table`, {
    name: '费用台账主表',
    fields: [
      { name: '编号', type: 'number' },
      { name: '账期', type: 'date' },
      { name: '付款金额', type: 'number' },
      sel('预提/实付', ['预提', '实付']),
      sel('当前进度', ['待预提', '预提完成', '待收账单', '已收账单', '费控提报中', '费控提报完成', '待付款', '已付款']),
      { name: '预提截止日期', type: 'date' },
      { name: '预提完成日期', type: 'date' },
      { name: '预提备注', type: 'longText' },
      { name: '账单预计到达日', type: 'date' },
      { name: '实际收到账单日期', type: 'date' },
      { name: '提交费控日期', type: 'date' },
      { name: '提交人', type: 'singleLineText' },
      { name: '付款单号', type: 'singleLineText' },
      { name: '付款截止日期', type: 'date' },
      { name: '实际付款日期', type: 'date' },
      { name: '备注', type: 'longText' },
      { name: '费用类型', type: 'singleLineText' },
      { name: '费用场景说明', type: 'singleLineText' },
      { name: '负责业务人', type: 'singleLineText' },
      { name: '最后通知时间', type: 'date' },
      { name: '场景配置ID', type: 'singleLineText' },
    ],
  });
  console.log('  TABLE_LEDGER:', t1.id);

  // 3. 费用提报表
  console.log('\nCreating 费用提报表...');
  const t2 = await api(`/api/base/${BASE_ID}/table`, {
    name: '费用提报表',
    fields: [
      { name: '费用类型', type: 'singleLineText' },
      { name: '场景说明', type: 'singleLineText' },
      { name: '费控单据类型', type: 'singleLineText' },
      sel('是否预提', ['否', '是']),
      { name: '法律主体', type: 'singleLineText' },
      { name: '供应商/收款方', type: 'singleLineText' },
      { name: '费用承担期间', type: 'date' },
      sel('类型', ['普通', '分摊']),
      sel('纸质单据', ['否', '是']),
      sel('是否员工垫付', ['否', '是']),
      { name: '事由描述', type: 'singleLineText' },
      { name: '费控费用类型', type: 'singleLineText' },
      { name: '费控费用项目', type: 'singleLineText' },
      { name: '单价', type: 'number' },
      sel('是否关联项目', ['是', '否']),
      { name: '费控战斗单元', type: 'singleLineText' },
      { name: '费控分摊部门', type: 'singleLineText' },
      { name: '费控现金事务', type: 'singleLineText' },
      { name: '发票类型', type: 'singleLineText' },
      { name: '税率', type: 'singleLineText' },
      { name: '受益日期从', type: 'date' },
      { name: '受益日期到', type: 'date' },
      { name: '发票图片', type: 'longText' },
      { name: '附件', type: 'longText' },
      { name: '合同编号', type: 'singleLineText' },
      sel('付款方式', ['CBS网银', '其他']),
      { name: '创建人', type: 'singleLineText' },
      { name: '创建时间', type: 'singleLineText' },
      { name: '场景配置ID', type: 'singleLineText' },
      { name: '台账编号', type: 'singleLineText' },
      { name: 'OCR结果', type: 'longText' },
    ],
  });
  console.log('  TABLE_SUBMIT:', t2.id);

  // 4. 用户表
  console.log('\nCreating 用户表...');
  const t3 = await api(`/api/base/${BASE_ID}/table`, {
    name: '用户表',
    fields: [
      { name: '账号', type: 'singleLineText' },
      { name: '昵称', type: 'singleLineText' },
      { name: '部门', type: 'singleLineText' },
      sel('角色', ['员工', '审批人', '管理员']),
      { name: '审批人', type: 'singleLineText' },
      sel('状态', ['待审核', '已激活', '已禁用']),
      { name: '注册时间', type: 'singleLineText' },
    ],
  });
  console.log('  TABLE_USER:', t3.id);

  // 5. 操作日志表
  console.log('\nCreating 操作日志表...');
  const t4 = await api(`/api/base/${BASE_ID}/table`, {
    name: '操作日志表',
    fields: [
      { name: '时间', type: 'singleLineText' },
      { name: '账号', type: 'singleLineText' },
      { name: '昵称', type: 'singleLineText' },
      { name: '页面', type: 'singleLineText' },
      { name: '操作', type: 'singleLineText' },
    ],
  });
  console.log('  TABLE_LOG:', t4.id);

  // 输出 api.js 配置
  console.log('\n========== api.js 配置 ==========');
  console.log(`const TABLE_LEDGER  = '${t1.id}';  // 费用台账主表`);
  console.log(`const TABLE_SUBMIT  = '${t2.id}';  // 费用提报表`);
  console.log(`const TABLE_USER    = '${t3.id}';  // 用户表`);
  console.log(`const TABLE_LOG     = '${t4.id}';  // 操作日志表`);
  console.log(`const BASE_ID       = '${BASE_ID}';  // 行政费控提报系统`);
  console.log(`// 场景配置表（参考数据 Base，只读）:`);
  console.log(`const REF_CONFIG_TABLE = 'tblAxpoD2Rh7PhJzJLG';`);
  console.log(`const REF_CONFIG_VIEW  = 'viwh50JByJ1SrEtmiNg';`);
  console.log('=================================');
}

main();
