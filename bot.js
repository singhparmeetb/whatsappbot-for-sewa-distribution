const { Client, LocalAuth, List } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
});

// const client = new Client({
//   authStrategy: new LocalAuth(),
//   puppeteer: {
//     executablePath: "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
//     headless: false,
//     args: ["--no-sandbox", "--disable-setuid-sandbox"],
//   },
// });

const axios = require("axios");
const csv = require("csv-parser");
const { Readable } = require("stream");

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1gYwXafF--423xs-wOqGNbGmk3c4-tkE1RXlMGfGv6kE/gviz/tq?tqx=out:csv";

const dutyMap = new Map();

async function loadSheet() {
  dutyMap.clear();

  const response = await axios.get(SHEET_URL);

  return new Promise((resolve, reject) => {
    Readable.from(response.data)
      .pipe(csv())
      .on("data", (row) => {
        const phone = String(row["Phone Number"]).replace(/\D/g, "");

        dutyMap.set(phone, {
          name: String(row["Name"]).trim(),
          batch: String(row["Batch"]).trim(),
          sewa: String(row["Sewa"]).trim(),
        });
      })
      .on("end", () => {
        console.log(`Loaded ${dutyMap.size} duties`);

        resolve();
      })
      .on("error", reject);
  });
}

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("=================================");
  console.log("WhatsApp Bot is Ready!");
  console.log(`Loaded ${dutyMap.size} duties`);
  console.log("=================================");
});

client.on("message", async (msg) => {
  if (msg.fromMe) {
    console.log("Testing");
  }
  console.log("Recieved %s", msg.from);

  const text = msg.body.trim().toLowerCase();

  if (text !== "hi" && text !== "hello") {
    await msg.reply(`🙏 Sat Sri Akal!

Please send *Hi* to receive your seva duty.

Waheguru Ji Ka Khalsa
Waheguru Ji Ki Fateh 🙏`);
    return;
  }

  // Sender phone number
  const senderId = msg.author || msg.from;

  let phone = "";

  // 2. Check if the ID ends with @lid
  if (senderId.endsWith("@lid")) {
    try {
      // Fetch the mapping database from WhatsApp Web
      const mapping = await client.getContactLidAndPhone([senderId]);
      console.log("Found mapping %s", mapping);
      if (mapping && mapping.length > 0 && mapping[0].pn) {
        // The 'pn' property contains the real phone number
        phone = mapping[0].pn;

        if (phone.endsWith("@c.us")) {
          phone = phone.split("@")[0].substring(2);
        }
      }
    } catch (error) {
      console.error("Failed to resolve LID mapping:", error);
    }
  } else if (senderId.endsWith("@c.us")) {
    // Standard non-LID user, extract the number directly
    phone = senderId.split("@")[0];
  }

  if (!dutyMap.has(phone)) {
    await msg.reply(
      `🙏 Sat Sri Akal!

Sorry, we could not find your duty assignment.

If you think this is a mistake, please contact the organizing team.

Waheguru Ji Ka Khalsa
Waheguru Ji Ki Fateh 🙏`,
    );
    console.log("Cannot find duty for %s", phone);
    return;
  }

  const person = dutyMap.get(phone);

  await msg.reply(
    `🙏 Sat Sri Akal, *${person.name}* Ji!

Your Seva Duty Details

👥 Batch: ${person.batch}
📍 Sewa: ${person.sewa}

Please report according to your batch timing.

Waheguru Ji Ka Khalsa
Waheguru Ji Ki Fateh 🙏`,
  );
});

setInterval(async () => {
  try {
    await loadSheet();
    console.log("Google Sheet refreshed");
  } catch (err) {
    console.error(err);
  }
}, 60 * 1000);

(async () => {
  try {
    await loadSheet();
    client.initialize();
  } catch (err) {
    console.error("Failed to load Google Sheet:", err);
  }
})();
