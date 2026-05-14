const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const srcDir = __dirname;
const outDir = path.join(__dirname, 'dist');

const obfuscationOptions = {
    compact: false, // Оставляем многострочность

    // === ОТКЛЮЧЕНО ТО, ЧТО ЛОМАЛО ЛОГИКУ ===
    controlFlowFlattening: false, // Выключаем искажение структуры, оно ломает UI
    deadCodeInjection: false,     // Выключаем мертвый код
    selfDefending: false,         // КРИТИЧНО: Выключаем самозащиту кода (она ломала inject.js)
    stringArrayCallsTransform: false, // Выключаем трансформацию вызовов массива

    // === ОСТАВЛЯЕМ БЕЗОПАСНУЮ ЗАПУТАННОСТЬ ===
    identifierNamesGenerator: 'hexadecimal', // Имена в 16-ричном формате
    renameGlobals: false,

    stringArray: true,
    stringArrayEncoding: ['base64'], // Безопасное шифрование строк
    stringArrayThreshold: 0.8,
    unicodeEscapeSequence: false,
    numbersToExpressions: true, // Запутывает числа

    // === ЗАЩИТА ТВОИХ ФУНКЦИЙ ===
    reservedNames: [
        'BalanceWidget',
        'spend', 'Spend',
        'delete', 'media'
    ],

    reservedStrings: [
        'balance', 'spend', 'media',
        'BalanceWidget',
        '.spend-badge', '#spend',
        '.media-delete', '.delete-btn'
    ]
};

function obfuscateDirectory(currentPath, targetPath) {
    if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
    }

    const items = fs.readdirSync(currentPath);

    for (const item of items) {
        if (['dist', 'node_modules', 'build.js', 'package.json', 'package-lock.json', '.git'].includes(item)) {
            continue;
        }

        const srcPath = path.join(currentPath, item);
        const destPath = path.join(targetPath, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            obfuscateDirectory(srcPath, destPath);
        } else {
            const ext = path.extname(srcPath);

            if (ext === '.js') {
                console.log(`[ЗАЩИТА] Файл: ${item}`);
                const code = fs.readFileSync(srcPath, 'utf8');
                try {
                    const result = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
                    fs.writeFileSync(destPath, result.getObfuscatedCode(), 'utf8');
                } catch (err) {
                    console.error(`[ОШИБКА] Не удалось запутать ${item}:`, err);
                    fs.copyFileSync(srcPath, destPath);
                }
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

console.log('--- ЗАПУСК БЕЗОПАСНОЙ ОБФУСКАЦИИ SNATCH ---');
if (fs.existsSync(outDir)) {
    console.log('Очистка старой папки dist...');
    fs.rmSync(outDir, { recursive: true, force: true });
}

obfuscateDirectory(srcDir, outDir);
console.log('\n✅ ГОТОВО! Проверь работоспособность (Баланс, Спенд, Медиа).');