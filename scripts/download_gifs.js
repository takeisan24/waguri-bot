const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

const destDir = path.join(__dirname, '../web/public/assets/gifs');
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

const urls = [
    {
        name: 'waguri_gif5.gif',
        url: 'https://cdn.discordapp.com/attachments/1517492833026703550/1526985495836491816/dd333a295544e193745bd4b4cebc35fd.gif?ex=6a59ac50&is=6a585ad0&hm=9393e1d2309c2a106cbe6d7157141bf4cfe9cf94ad4ce7b1b6ed645657a79c6d'
    },
    {
        name: 'waguri_gif0.gif',
        url: 'https://cdn.discordapp.com/attachments/1517492833026703550/1526981804995772568/image0.gif?ex=6a59a8e0&is=6a585760&hm=d95b224dc3c62dff5851168fff54a09aa64b4f78ecc4b64f8fd7508f4d2908fa'
    },
    {
        name: 'waguri_gif1.gif',
        url: 'https://cdn.discordapp.com/attachments/1517492833026703550/1526981805314412634/image1.gif?ex=6a59a8e0&is=6a585760&hm=b026a8dab4b3da5b4f239f4c1e5082c39f13fb46d4a16bf38e19abbcf0a120b3'
    },
    {
        name: 'waguri_gif2.gif',
        url: 'https://cdn.discordapp.com/attachments/1517492833026703550/1526981805712867408/image2.gif?ex=6a59a8e0&is=6a585760&hm=d6b0c6f4007b67266d5830d7e859ba5f87759c0e4832811216e50a9710f74b65'
    },
    {
        name: 'waguri_gif3.gif',
        url: 'https://cdn.discordapp.com/attachments/1517492833026703550/1526981806010667081/image3.gif?ex=6a59a8e0&is=6a585760&hm=c70af4facf7f6e41b0664f070acb11fe84e0e590f33dec9558f5be7971164a50'
    },
    {
        name: 'waguri_gif4.gif',
        url: 'https://cdn.discordapp.com/attachments/1517492833026703550/1526981806421835929/image4.gif?ex=6a59a8e0&is=6a585760&hm=b8828ed701043196a3cface60211c32af74a24f9defce2c4c5c126d50293e215'
    }
];

async function downloadAll() {
    for (const item of urls) {
        console.log(`Downloading ${item.name}...`);
        try {
            const res = await fetch(item.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buf = await res.arrayBuffer();
            fs.writeFileSync(path.join(destDir, item.name), Buffer.from(buf));
            console.log(`Saved ${item.name}`);
        } catch (e) {
            console.error(`Failed to download ${item.name}:`, e.message);
        }
    }
}

downloadAll();
