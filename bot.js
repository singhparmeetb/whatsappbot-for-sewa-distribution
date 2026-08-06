const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
});

const XLSX = require("xlsx");
let BOT_START_TIME = 0;

// const axios = require("axios");
// const csv = require("csv-parser");
// const { Readable } = require("stream");

// const SHEET_URL =
//   "https://docs.google.com/spreadsheets/d/1gYwXafF--423xs-wOqGNbGmk3c4-tkE1RXlMGfGv6kE/gviz/tq?tqx=out:csv";

const dutyMap = new Map();

function loadExcel() {
  dutyMap.clear();

  const workbook = XLSX.readFile("D:\\LocalSend\\Sewa_Allocation.xlsx");

  const usersSheet = workbook.Sheets["Users"];
  const allocationsSheet = workbook.Sheets["Allocations"];

  if (!usersSheet || !allocationsSheet) {
    throw new Error("Workbook must contain Users and Allocations sheets.");
  }

  const users = XLSX.utils.sheet_to_json(usersSheet);

  const allocations = XLSX.utils.sheet_to_json(allocationsSheet);

  const idMap = new Map();

  // Users

  users.forEach((row) => {
    idMap.set(String(row.ID), {
      phone: String(row.Number).replace(/\D/g, ""),

      name: String(row.Name).trim(),

      duties: new Map(),
    });
  });

  // Allocations

  allocations.forEach((row) => {
    const id = String(row.ID).trim();

    console.log("Looking for ID='%s' (length=%d)", id, id.length);

    // console.log("Available IDs:", [...idMap.keys()]);

    const person = idMap.get(id);

    if (!person) {
      console.warn("Unknown ID %s in Allocations", row.ID);
      // continue;
      return;
    }

    const batch = String(row.BatchNo ?? "")
      .trim()
      .toUpperCase();
    const sewa = String(row.Sewa ?? "").trim();

    if (
      batch === "" ||
      sewa === "" ||
      batch === "NA" ||
      sewa.toUpperCase() === "NA"
    ) {
      console.log(
        "Skipping invalid allocation. ID=%s Batch='%s' Sewa='%s'",
        row.ID,
        batch,
        sewa,
      );
      return;
    }

    person.duties.set(batch, sewa);
  });

  // Build lookup

  idMap.forEach((person) => {
    dutyMap.set(
      person.phone,

      person,
    );
  });

  console.log("Loaded %d users", dutyMap.size);
}

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("=================================");
  console.log("WhatsApp Bot is Ready!");
  console.log(`Loaded ${dutyMap.size} duties`);
  console.log("=================================");

  BOT_START_TIME = Math.floor(Date.now() / 1000) - 5;
});

async function resolvePhoneNumber(msg) {
  const senderId = msg.author || msg.from;

  if (senderId.endsWith("@c.us")) {
    return senderId.split("@")[0].substring(2);
  }

  if (senderId.endsWith("@lid")) {
    try {
      const mapping = await client.getContactLidAndPhone([senderId]);

      if (mapping && mapping.length > 0 && mapping[0].pn) {
        let phone = mapping[0].pn;

        if (phone.endsWith("@c.us")) {
          phone = phone.split("@")[0].substring(2);
        }

        return phone;
      }
    } catch (err) {
      console.error(err);
    }
  }

  return "";
}

async function handleBatchSelection(msg, person, batch) {
  const sewa = person.duties.get(batch);

  if (!sewa) {
    await msg.reply(
      `Invalid batch selected.

Please send *Sewa* again.`,
    );

    return;
  }

  await msg.reply(
    `🙏 Sat Sri Akal *${person.name}* Ji!

👥 Batch: ${batch}
📍 Sewa: ${sewa}`,
  );
}

async function handleHi(msg, person) {
  if (person.duties.size === 1) {
    const [batch, sewa] = person.duties.entries().next().value;

    await msg.reply(
      `🙏 Sat Sri Akal *${person.name}* Ji!

👥 Batch: ${batch}
📍 Sewa: ${sewa}`,
    );

    return;
  }

  const menu = [...person.duties.keys()]
    .map((batch) => `• ${batch}`)
    .join("\n");

  await msg.reply(
    `🙏 Sat Sri Akal *${person.name}* Ji!

You have multiple seva allocations.

Please reply with the corresponding batch number:

${menu}`,
  );
}

client.on("message", async (msg) => {
  if (msg.fromMe) {
    console.log("Self Messages not allowed");
    return;
  }

  if (
    msg.from.endsWith("@c.us") ||
    msg.from.endsWith("@g.us") ||
    msg.from.endsWith("@lid")
  ) {
    const text = msg.body.trim();
    const isMenuOption = /^\d+$/.test(text);
    if (text !== "Sewa" && !isMenuOption) {
      //       await msg.reply(
      //         `🙏 Sat Sri Akal!

      // Please send *Hi* to receive your seva duty.

      // Waheguru Ji Ka Khalsa
      // Waheguru Ji Ki Fateh 🙏`,
      //       );

      console.warn("Invalid Mesage received, will not respond");
      console.log({
        from: msg.from,
        type: msg.type,
        fromMe: msg.fromMe,
        author: msg.author,
        body: msg.body,
      });
      return;
    } else if (msg.timestamp < BOT_START_TIME) {
      console.warn("Older Mesage received, will not respond");
      console.log({
        from: msg.from,
        type: msg.type,
        fromMe: msg.fromMe,
        author: msg.author,
        body: msg.body,
      });
      return;
    }

    const phone = await resolvePhoneNumber(msg);
    console.log({
      from: msg.from,
      type: msg.type,
      fromMe: msg.fromMe,
      author: msg.author,
      body: msg.body,
    });
    console.log("Received from %s", phone);

    if (!dutyMap.has(phone)) {
      console.log("Cannot find duty for %s", phone);

      await msg.reply(
        `🙏 Sat Sri Akal!

      Sorry, we could not find your duty assignment.

      If you think this is a mistake, please contact the organizing team.

      Waheguru Ji Ka Khalsa
      Waheguru Ji Ki Fateh 🙏`,
      );

      return;
    }

    const person = dutyMap.get(phone);

    if (isMenuOption) {
      await handleBatchSelection(msg, person, text);

      return;
    }

    await handleHi(msg, person);
  } else {
    console.warn("Invalid Message Source");
    console.log({
      from: msg.from,
      type: msg.type,
      fromMe: msg.fromMe,
      author: msg.author,
      body: msg.body,
    });
  }
});

setInterval(
  async () => {
    try {
      await loadExcel();
      console.log("Excel Sheet refreshed");
    } catch (err) {
      console.error(err);
    }
  },
  5 * 60 * 1000,
);

client.on("qr", () => {
  console.log("QR generated");
});

client.on("authenticated", () => {
  console.log("Authenticated");
});

client.on("auth_failure", (msg) => {
  console.log("Authentication failed:", msg);
});

client.on("loading_screen", (percent, message) => {
  console.log(`Loading ${percent}% - ${message}`);
});

(async () => {
  try {
    await loadExcel();
    client.initialize();
    console.log("Initialized The map");
    // console.log(dutyMap);
  } catch (err) {
    console.error("Failed to load Excel Sheet:", err);
  }
})();
