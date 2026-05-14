// ═══════════════════════════════════════════════════════════
// ТЕСТОВЫЙ СКРИПТ ДЛЯ ПРОВЕРКИ LOGIN HOOK
// ═══════════════════════════════════════════════════════════
// Скопируйте этот код в консоль браузера (F12 → Console) на странице alpha.date
// и выполните для проверки работы login hook

console.log('🧪 === ТЕСТ LOGIN HOOK ===');

// Тест 1: Проверка наличия перехватчиков
console.log('\n📋 Тест 1: Проверка перехватчиков');
console.log('window.fetch:', typeof window.fetch);
console.log('XMLHttpRequest:', typeof XMLHttpRequest);

// Тест 2: Проверка chrome.runtime
console.log('\n📋 Тест 2: Проверка chrome.runtime');
console.log('chrome:', typeof chrome);
console.log('chrome.runtime:', typeof chrome?.runtime);
console.log('chrome.runtime.sendMessage:', typeof chrome?.runtime?.sendMessage);

// Тест 3: Проверка storage
console.log('\n📋 Тест 3: Проверка storage');
chrome.storage.local.get(['snHookedOperatorId', 'snJwt'], (data) => {
  console.log('snHookedOperatorId:', data.snHookedOperatorId || 'НЕТ');
  console.log('snJwt:', data.snJwt ? (data.snJwt.substring(0, 50) + '...') : 'НЕТ');
});

// Тест 4: Отправка тестового сообщения
console.log('\n📋 Тест 4: Отправка тестового сообщения');
chrome.runtime.sendMessage({
  cmd: 'saveLoginData',
  operatorId: 'TEST_12345',
  token: 'TEST_TOKEN_eyJhbGciOi1IUzI1NiIsInR5cCI6IkpXVCJ9'
}, (response) => {
  if (chrome.runtime.lastError) {
    console.error('❌ Ошибка:', chrome.runtime.lastError.message);
  } else {
    console.log('✅ Ответ от background:', response);
  }
});

// Тест 5: Проверка что данные сохранились
setTimeout(() => {
  console.log('\n📋 Тест 5: Проверка сохранения тестовых данных');
  chrome.storage.local.get(['snHookedOperatorId', 'snJwt'], (data) => {
    if (data.snHookedOperatorId === 'TEST_12345') {
      console.log('✅ Тестовый operator_id сохранен:', data.snHookedOperatorId);
    } else {
      console.error('❌ Тестовый operator_id НЕ сохранен');
    }
    
    if (data.snJwt && data.snJwt.includes('TEST_TOKEN')) {
      console.log('✅ Тестовый token сохранен');
    } else {
      console.error('❌ Тестовый token НЕ сохранен');
    }
  });
}, 1000);

// Тест 6: Симуляция fetch запроса
console.log('\n📋 Тест 6: Симуляция fetch запроса к /api/login/login');
console.log('Выполните реальный логин чтобы проверить перехват');
console.log('Или выполните:');
console.log(`
fetch('https://alpha.date/api/login/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@test.com', password: 'test' })
}).then(r => r.json()).then(d => console.log('Ответ:', d));
`);

console.log('\n🧪 === ТЕСТ ЗАВЕРШЕН ===');
console.log('Проверьте результаты выше ⬆️');
