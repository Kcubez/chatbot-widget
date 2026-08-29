import { prisma } from '@/lib/prisma';
import { sendMessengerMessage, sendMessengerQuickReplies } from '@/lib/messenger';

const CLASSES: Record<string, string> = {
  ai_golden: 'AI Golden Package Class',
  golden: 'Golden Package Class',
  speaking: 'Speaking Class',
  hsk: 'HSK Class',
};

const TOWNSHIPS = ['လှိုင်သာယာ', 'တာမွေ', 'လှည်းတန်း', 'လမ်းမတော်', 'ရွှေပြည်သာ', 'မြောက်ဥက္ကလာပ', 'မြေနီကုန်း', 'မြောက်ဒဂုံ'];

const menuReplies = [
  { title: '📅 အတန်းချိန်မေးရန်', payload: 'EDU_START' },
  { title: '📚 သင်တန်းအကြောင်း', payload: 'EDU_CLASS_INFO' },
  { title: '📞 ဆက်သွယ်ရန်', payload: 'MENU_CONTACT_US' },
];

export async function isEducationBot(bot: any) {
  return bot.botCategory === 'education_registration';
}

export async function handleEducationPostback(bot: any, token: string, senderId: string, payload: string) {
  if (payload === 'GET_STARTED' || payload === 'MENU_HOME' || payload === 'MAIN_MENU') {
    await sendMessengerQuickReplies(token, senderId, 'G.E.S.C Chinese Language Center မှ ကြိုဆိုပါတယ်ရှင့်။ ဘာကူညီပေးရမလဲရှင့်။', menuReplies);
    return true;
  }
  if (payload === 'EDU_CLASS_INFO') {
    await sendMessengerQuickReplies(token, senderId, 'လက်ရှိဖွင့်လှစ်ထားသော သင်တန်းများထဲမှ ရွေးချယ်နိုင်ပါတယ်ရှင့်။', Object.entries(CLASSES).map(([id, label]) => ({ title: label.replace(' Package', '').slice(0, 20), payload: `EDU_INFO_${id}` })));
    return true;
  }
  if (payload.startsWith('EDU_INFO_')) {
    const name = CLASSES[payload.slice('EDU_INFO_'.length)];
    await sendMessengerQuickReplies(token, senderId, `${name || 'သင်တန်း'} အကြောင်း အသေးစိတ်နှင့် လက်ရှိအတန်းချိန်ကို သိလိုပါက အောက်ပါခလုတ်ကိုနှိပ်ပါရှင့်။`, [{ title: '📅 အတန်းချိန်မေးရန်', payload: 'EDU_START' }, { title: '🏠 အစသို့', payload: 'MENU_HOME' }]);
    return true;
  }
  if (payload === 'EDU_START') {
    await prisma.messengerSession.upsert({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } }, create: { botId: bot.id, messengerSenderId: senderId, state: 'education_select_class' }, update: { state: 'education_select_class', pendingData: {} } });
    await sendMessengerQuickReplies(token, senderId, 'တက်ရောက်လိုသည့် Class အမျိုးအစားကို ရွေးပေးပါရှင့်။', Object.entries(CLASSES).map(([id, label]) => ({ title: label.replace(' Package', '').slice(0, 20), payload: `EDU_CLASS_${id}` })));
    return true;
  }
  if (payload.startsWith('EDU_CLASS_')) {
    const classId = payload.slice('EDU_CLASS_'.length);
    if (!CLASSES[classId]) return true;
    await prisma.messengerSession.update({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } }, data: { state: 'education_select_mode', pendingData: { classType: CLASSES[classId] } } });
    await sendMessengerQuickReplies(token, senderId, 'Class ပုံစံကို ရွေးပေးပါရှင့်။', [{ title: '🏫 On Campus Class', payload: 'EDU_MODE_CAMPUS' }, { title: '💻 Online Class', payload: 'EDU_MODE_ONLINE' }]);
    return true;
  }
  if (payload === 'EDU_MODE_ONLINE') return createScheduleRequest(bot, token, senderId, 'Online Class');
  if (payload === 'EDU_MODE_CAMPUS') {
    const session = await prisma.messengerSession.findUnique({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } } });
    await prisma.messengerSession.update({ where: { id: session!.id }, data: { state: 'education_select_township' } });
    await sendMessengerQuickReplies(token, senderId, 'တက်ရောက်လိုသည့် မြို့နယ်ကို ရွေးပေးပါရှင့်။', TOWNSHIPS.map((township, index) => ({ title: township, payload: `EDU_TOWNSHIP_${index}` })));
    return true;
  }
  if (payload.startsWith('EDU_TOWNSHIP_')) return createScheduleRequest(bot, token, senderId, 'On Campus Class', TOWNSHIPS[Number(payload.slice('EDU_TOWNSHIP_'.length))]);
  if (payload.startsWith('EDU_SCHEDULE_OK_')) return startRegistration(bot, token, senderId, payload.slice('EDU_SCHEDULE_OK_'.length));
  if (payload.startsWith('EDU_SCHEDULE_CHANGE_')) {
    const id = payload.slice('EDU_SCHEDULE_CHANGE_'.length);
    await prisma.educationRegistration.updateMany({ where: { id, botId: bot.id, messengerSenderId: senderId }, data: { status: 'customer_requested_change' } });
    await sendMessengerMessage(token, senderId, 'အခြားအချိန်ကို Admin Team မှ ထပ်မံစစ်ဆေးပြီး ပြန်လည်အကြောင်းကြားပေးပါမယ်ရှင့်။');
    return true;
  }
  return false;
}

async function createScheduleRequest(bot: any, token: string, senderId: string, learningMode: string, township?: string) {
  const session = await prisma.messengerSession.findUnique({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } } });
  const classType = (session?.pendingData as any)?.classType;
  const request = await prisma.educationRegistration.create({ data: { botId: bot.id, messengerSenderId: senderId, classType, learningMode, township, status: 'pending_admin' } });
  await prisma.messengerSession.update({ where: { id: session!.id }, data: { state: 'education_pending_admin', pendingData: { requestId: request.id } } });
  await sendMessengerQuickReplies(token, senderId, 'ကျေးဇူးတင်ပါတယ်ရှင့်။ လက်ရှိအတန်းလက်ခံနိုင်မှုနှင့် Class Schedule ကို Admin Team မှ စစ်ဆေးပြီး ပြန်လည်အကြောင်းကြားပေးပါမယ်ရှင့်။', [{ title: '🏠 အစသို့', payload: 'MENU_HOME' }]);
  return true;
}

async function startRegistration(bot: any, token: string, senderId: string, requestId: string) {
  const result = await prisma.educationRegistration.updateMany({ where: { id: requestId, botId: bot.id, messengerSenderId: senderId, status: 'schedule_offered' }, data: { status: 'collecting_registration' } });
  if (!result.count) return true;
  await prisma.messengerSession.upsert({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } }, create: { botId: bot.id, messengerSenderId: senderId, state: 'education_collecting_name', pendingData: { requestId } }, update: { state: 'education_collecting_name', pendingData: { requestId } } });
  await sendMessengerMessage(token, senderId, 'Registration အတွက် English လို အမည်အပြည့်အစုံ ပို့ပေးပါရှင့်။');
  return true;
}

export async function handleEducationText(bot: any, token: string, senderId: string, text: string) {
  const session = await prisma.messengerSession.findUnique({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } } });
  const requestId = (session?.pendingData as any)?.requestId;
  const state = session?.state;
  if (state === 'education_collecting_nrc') {
    if (!requestId || text.trim().length < 2) {
      await sendMessengerMessage(token, senderId, 'ကျေးဇူးပြု၍ မှတ်ပုံတင်နံပါတ် အပြည့်အစုံ ပို့ပေးပါရှင့်။');
      return;
    }
    await finishEducationRegistration(bot, token, senderId, text);
    return;
  }
  const fields: Record<string, { field: string; next: string; prompt: string }> = {
    education_collecting_name: { field: 'fullName', next: 'education_collecting_phone', prompt: 'ဖုန်းနံပါတ် ပို့ပေးပါရှင့်။ Online Class အတွက် Telegram/Viber အသုံးပြုနိုင်သော နံပါတ်ပေးပါရှင့်။' },
    education_collecting_phone: { field: 'phone', next: 'education_collecting_address', prompt: 'လိပ်စာ ပို့ပေးပါရှင့်။' },
    education_collecting_address: { field: 'address', next: 'education_collecting_dob', prompt: 'မွေးနေ့အပြည့်အစုံ ပို့ပေးပါရှင့်။' },
    education_collecting_dob: { field: 'dateOfBirth', next: 'education_collecting_nrc', prompt: 'မှတ်ပုံတင်နံပါတ် အပြည့်အစုံ ပို့ပေးပါရှင့်။' },
  };
  const step = state ? fields[state] : undefined;
  if (!step || !requestId) {
    await sendMessengerQuickReplies(token, senderId, 'အတန်းချိန်မေးမြန်းလိုပါက အောက်ပါခလုတ်ကိုနှိပ်ပေးပါရှင့်။', menuReplies);
    return;
  }
  if (text.trim().length < 2) { await sendMessengerMessage(token, senderId, 'ကျေးဇူးပြု၍ အချက်အလက်ကို မှန်ကန်စွာ ပြန်ပို့ပေးပါရှင့်။'); return; }
  await prisma.educationRegistration.update({ where: { id: requestId }, data: { [step.field]: text.trim() } });
  await prisma.messengerSession.update({ where: { id: session!.id }, data: { state: step.next } });
  await sendMessengerMessage(token, senderId, step.prompt);
}

export async function finishEducationRegistration(bot: any, token: string, senderId: string, text: string) {
  const session = await prisma.messengerSession.findUnique({ where: { botId_messengerSenderId: { botId: bot.id, messengerSenderId: senderId } } });
  const requestId = (session?.pendingData as any)?.requestId;
  if (!requestId) return;
  await prisma.educationRegistration.update({ where: { id: requestId }, data: { nrcNumber: text.trim(), status: 'handed_to_human', handedOffAt: new Date() } });
  await prisma.messengerSession.update({ where: { id: session!.id }, data: { state: 'education_handed_to_human' } });
  await sendMessengerQuickReplies(token, senderId, 'Registration အချက်အလက်များကို လက်ခံရရှိပါပြီရှင့်။ သက်ဆိုင်ရာ Admin Team မှ ဆက်လက်ဆောင်ရွက်ပေးပါမယ်ရှင့်။', [{ title: '🏠 အစသို့', payload: 'MENU_HOME' }]);
}
