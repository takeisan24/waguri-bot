const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const VI_JSON_PATH = path.join(ROOT_DIR, 'web', 'src', 'locales', 'vi.json');
const EN_JSON_PATH = path.join(ROOT_DIR, 'web', 'src', 'locales', 'en.json');
const WEB_SRC_DIR = path.join(ROOT_DIR, 'web', 'src');

console.log('🌐 === KIỂM TRA ĐỘ BAO PHỦ & ĐỒNG BỘ NGHĨA i18n (i18n Coverage Check) ===\n');

let hasError = false;
let warningCount = 0;

// Helper: Flatten nested JSON object into dot-notation keys
function flattenKeys(obj, prefix = '') {
    let keys = {};
    for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.assign(keys, flattenKeys(v, fullKey));
        } else {
            keys[fullKey] = v;
        }
    }
    return keys;
}

// 1. KIỂM TRA ĐỒNG BỘ PARITY GIỮA VI.JSON VÀ EN.JSON
console.log('1️⃣  Đang kiểm tra sự đồng bộ Key giữa vi.json và en.json...');
if (!fs.existsSync(VI_JSON_PATH) || !fs.existsSync(EN_JSON_PATH)) {
    console.error('❌ Thấy thiếu tệp vi.json hoặc en.json!');
    process.exit(1);
}

const viData = JSON.parse(fs.readFileSync(VI_JSON_PATH, 'utf8'));
const enData = JSON.parse(fs.readFileSync(EN_JSON_PATH, 'utf8'));

const viFlat = flattenKeys(viData);
const enFlat = flattenKeys(enData);

const viKeys = new Set(Object.keys(viFlat));
const enKeys = new Set(Object.keys(enFlat));

const missingInEn = [...viKeys].filter(k => !enKeys.has(k));
const missingInVi = [...enKeys].filter(k => !viKeys.has(k));

if (missingInEn.length > 0) {
    hasError = true;
    console.error(`\n❌ Phát hiện ${missingInEn.length} key có trong vi.json nhưng THIẾU trong en.json:`);
    missingInEn.forEach(k => console.error(`   - ${k}`));
}

if (missingInVi.length > 0) {
    hasError = true;
    console.error(`\n❌ Phát hiện ${missingInVi.length} key có trong en.json nhưng THIẾU trong vi.json:`);
    missingInVi.forEach(k => console.error(`   - ${k}`));
}

// Kiểm tra key bị rỗng (empty string)
const emptyInVi = Object.entries(viFlat).filter(([_, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);
const emptyInEn = Object.entries(enFlat).filter(([_, v]) => typeof v === 'string' && v.trim() === '').map(([k]) => k);

if (emptyInVi.length > 0) {
    hasError = true;
    console.error(`\n❌ Có ${emptyInVi.length} key bị bỏ RỖNG trong vi.json:`, emptyInVi);
}
if (emptyInEn.length > 0) {
    hasError = true;
    console.error(`\n❌ Có ${emptyInEn.length} key bị bỏ RỖNG trong en.json:`, emptyInEn);
}

if (!hasError) {
    console.log(`✅ Tuyệt vời! Tất cả ${viKeys.size} keys trong vi.json & en.json đã khớp nhau 100%.\n`);
}

// 2. KIỂM TRA ĐỘ BAO PHỦ COMMAND LOCALIZER (COMMANDS / SUBCOMMANDS / OPTIONS)
console.log('2️⃣  Đang kiểm tra tệp commandLocalizer.js...');
const { COMMAND_DESCRIPTIONS, SUBCOMMAND_DESCRIPTIONS, OPTION_DESCRIPTIONS } = require('../src/lib/commandLocalizer');

function checkLocalizerDict(dict, dictName) {
    let dictError = false;
    for (const [key, val] of Object.entries(dict)) {
        if (!val || typeof val !== 'object' || !val.vi || !val.en) {
            console.error(`❌ [${dictName}] Key "${key}" thiếu bản dịch vi hoặc en!`);
            dictError = true;
        } else {
            if (!val.vi.trim()) { console.error(`❌ [${dictName}] Key "${key}" có bản vi rỗng!`); dictError = true; }
            if (!val.en.trim()) { console.error(`❌ [${dictName}] Key "${key}" có bản en rỗng!`); dictError = true; }
        }
    }
    return dictError;
}

const localizerFailed = checkLocalizerDict(COMMAND_DESCRIPTIONS, 'COMMAND_DESCRIPTIONS') ||
                        checkLocalizerDict(SUBCOMMAND_DESCRIPTIONS, 'SUBCOMMAND_DESCRIPTIONS') ||
                        checkLocalizerDict(OPTION_DESCRIPTIONS, 'OPTION_DESCRIPTIONS');

if (localizerFailed) {
    hasError = true;
} else {
    console.log('✅ commandLocalizer.js đạt 100% bao phủ song ngữ (vi + en).\n');
}

// 3. QUÉT CODE WEB FE (.TSX) TÌM CHỮ TIẾNG VIỆT HARDCODED NGOÀI TỢP LOCALE
console.log('3️⃣  Đang quét các tệp .tsx tìm chữ tiếng Việt Hardcoded chưa qua t("key")...');

// Regex nhận diện ký tự tiếng Việt có dấu
const VIETNAMESE_CHAR_REGEX = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function scanDirForHardcoded(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            if (file.name !== 'node_modules' && file.name !== '.next') {
                scanDirForHardcoded(fullPath);
            }
        } else if (file.name.endsWith('.tsx')) {
            scanFileForHardcoded(fullPath);
        }
    }
}

function scanFileForHardcoded(filePath) {
    const relativePath = path.relative(ROOT_DIR, filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Bỏ qua comment, import, console.log, metadata JSON-LD, aria-label tiếng Việt tĩnh nếu có
        if (
            trimmed.startsWith('//') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('import ') ||
            trimmed.includes('console.log') ||
            trimmed.includes('JSON.stringify') ||
            trimmed.includes('schema.org')
        ) {
            return;
        }

        // Bỏ qua nếu dòng này nằm trong hàm t("...")
        if (trimmed.includes('t(') || trimmed.includes('tClient(') || trimmed.includes('getLocaleServer(')) {
            // Nếu dòng chỉ chứa t("...") thì khả năng cao đã được dịch
            if (!VIETNAMESE_CHAR_REGEX.test(line.replace(/t\("[^"]+"\)/g, '').replace(/t\('[^']+'\)/g, ''))) {
                return;
            }
        }

        // Kiểm tra xem dòng có chứa chữ tiếng Việt có dấu hay không
        if (VIETNAMESE_CHAR_REGEX.test(line)) {
            warningCount++;
            console.warn(`  ⚠️ [HARDCODED] ${relativePath}:${idx + 1}`);
            console.warn(`     └── Line: "${trimmed.slice(0, 100)}${trimmed.length > 100 ? '...' : ''}"`);
        }
    });
}

scanDirForHardcoded(path.join(WEB_SRC_DIR, 'app'));
scanDirForHardcoded(path.join(WEB_SRC_DIR, 'components'));

if (warningCount === 0) {
    console.log('✅ Cực kỳ sạch sẽ! Không phát hiện chữ tiếng Việt hardcoded chưa qua i18n trong tệp .tsx.\n');
} else {
    console.log(`\n⚠️ Phát hiện ${warningCount} dòng có thể chứa chữ tiếng Việt Hardcoded trong giao diện Web.\n   (Hãy kiểm tra các dòng trên và chuyển sang dùng t("key") nếu cần thiết).\n`);
}

// 4. KẾT LUẬN
if (hasError) {
    console.error('❌ BÀI KIỂM TRA I18N THẤT BẠI: Vui lòng bổ sung key tiếng Việt/tiếng Anh còn thiếu trước khi commit!');
    process.exit(1);
} else {
    console.log('🎉 BÀI KIỂM TRA I18N HOÀN TOÀN HỢP LỆ (PASS 100%)!');
    process.exit(0);
}
