import "dotenv/config";
import express from "express";
import fs from "fs";
import { ActivityType, Client, ContainerBuilder, GatewayIntentBits, MessageFlags, REST, Routes, SlashCommandBuilder } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";

// WEB SERVER RENDER - FIX No open ports
const app = express();
app.get("/", (req, res) => res.send("GES VR Bot Running - OK"));
app.get("/ping", (req, res) => res.send("pong"));
app.listen(process.env.PORT || 10000, () => console.log(`Web server on ${process.env.PORT || 10000}`));

const PREFIX = "!";
const INVITE_LINK = "https://discord.gg/J4v2WDsGjP";

// DATA
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const OWNER_FILE = "./data/owners.json";
const FAKE_BANNER_FILE = "./data/fakebanner.json";
let ownersData = {};
let fakeBanners = {};
try { ownersData = JSON.parse(fs.readFileSync(OWNER_FILE, "utf8")); } catch {}
try { fakeBanners = JSON.parse(fs.readFileSync(FAKE_BANNER_FILE, "utf8")); } catch {}
function saveOwners() { fs.writeFileSync(OWNER_FILE, JSON.stringify(ownersData)); }
function saveFake() { fs.writeFileSync(FAKE_BANNER_FILE, JSON.stringify(fakeBanners)); }

class VoiceManager {
  constructor(g) { this.group = g; this.connections = new Map(); }
  getConnection(id) { return this.connections.get(id); }
  setConnection(id, c) { this.connections.set(id, c); }
  removeConnection(id) { this.connections.delete(id); }
}
function leave(voice, guildId) {
  const c = voice.getConnection(guildId);
  voice.removeConnection(guildId);
  if (c) try { c.destroy(); } catch {}
}

const avatarCmd = new SlashCommandBuilder().setName("avatar").setDescription("Xem avatar").addUserOption(o => o.setName("user").setDescription("user").setRequired(false));
const bannerCmd = new SlashCommandBuilder().setName("banner").setDescription("Xem banner").addUserOption(o => o.setName("user").setDescription("user").setRequired(false));
const helpCmd = new SlashCommandBuilder().setName("help").setDescription("Xem tất cả lệnh của bot GES VR");

async function startBot(token, label) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const voice = new VoiceManager(label);

  client.once("ready", () => {
    console.log(`[${label}] Online ${client.user.tag}`);
    client.user.setPresence({ status: "online", activities: [{ name: "🥽 VR | Join GES", type: ActivityType.Watching }] });
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();
    if (!content.startsWith(PREFIX)) return;

    let cmdName = content.slice(1).split(/\s+/)[0].toLowerCase();
    let args = content.slice(1).split(/\s+/).slice(1);
    let name = cmdName;

    if (name === "set" && (args[0]?.toLowerCase() === "owner" || args[0]?.toLowerCase() === "owners")) {
      name = "setowner";
      args = args.slice(1);
    }
    if (name === "setowners" || name === "addowner") name = "setowner";
    if (name === "removeowners") name = "removeowner";

    const owners = ownersData[message.guild.id] || [];
    const isOwner = owners.includes(message.author.id) || message.guild.ownerId === message.author.id;

    if (name === "help") {
      return message.reply(`**🥽 GES VR BOT - FULL LỆNH**\n\n**🎙️ Voice:**\n\`!join\` - Bot vào voice\n\`!leave\` - Bot rời voice\n\n**🔒 Channel (Chỉ Owner):**\n\`!lock\` - Khóa kênh hiện tại\n\`!unlock\` - Mở khóa kênh\n\n**👤 Thông tin:**\n\`/avatar @user\` - Xem avatar\n\`/banner @user\` - Xem banner\n\`/help\` - Xem bảng này\n\n**🛠️ Quản lý (Chỉ Owner):**\n\`!setowner @user\` / \`!set owners @user\` - Thêm owner\n\`!removeowner @user\` - Gỡ owner\n\`!owners\` - Xem danh sách owner\n\`!mute @user\` - Mute 10p\n\`!unmute @user\`\n\`!ban @user\` / \`!unban ID\`\n\n**🤖 Bot Owner:**\n\`!set avatar [ảnh]\` - Đổi avatar bot\n\`!set banner [link]\` - Đổi banner thật\n\`!set banner ảo [link]\` - Đổi banner ảo (ko cần Nitro)\n\n**🔗 GES:** ${INVITE_LINK}`);
    }

    if (name === "lock" || name === "lockchannel") {
      if (!isOwner) return message.reply("❌ Chỉ Owner (`!set owners`) mới được khóa kênh ní ơi!");
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply(`🔒 Đã khóa ${message.channel} | Chỉ Owner mới mở được`);
    }
    if (name === "unlock" || name === "unlockchannel") {
      if (!isOwner) return message.reply("❌ Chỉ Owner mới được mở khóa!");
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      return message.reply(`🔓 Đã mở khóa ${message.channel}`);
    }

    if (name === "ges") return message.reply(INVITE_LINK);

    if (name === "set") {
      const sub = args[0]?.toLowerCase();
      if (!isOwner) return message.reply("Chỉ owner mới được đổi ní ơi!");
      if (sub === "avatar") {
        let url = message.attachments.first()?.url || args[1];
        if (!url) return message.reply("Gửi kèm ảnh: `!set avatar` + ảnh");
        try { await client.user.setAvatar(url); return message.reply("✅ Đã đổi avatar! 🥽"); } catch (e) { return message.reply(`Lỗi: ${e.message}`); }
      }
      if (sub === "banner") {
        let isAo = args.includes("ảo") || args.includes("ao");
        let url = message.attachments.first()?.url || args[1];
        if (args[1]?.toLowerCase() === "ảo" || args[1]?.toLowerCase() === "ao") url = message.attachments.first()?.url || args[2];
        if (!url) return message.reply("Dùng: `!set banner https://link.png` hoặc `!set banner ảo https://link.png`");
        fakeBanners[client.user.id] = url; saveFake();
        if (isAo) return message.reply(`✅ Đã set banner ẢO: ${url}`);
        try { await client.user.setBanner(url); return message.reply(`✅ Đã đổi cả THẬT + ẢO!`); }
        catch (e) { return message.reply(`⚠️ Thật cần Nitro nên lỗi: ${e.message}\nNhưng đã lưu ẢO rồi, /banner @bot là thấy!`); }
      }
    }

    if (name === "setowner") {
      if (owners.length > 0 && !isOwner) return message.reply("❌ Chỉ Owner mới được thêm owner khác!");
      const ids = message.mentions.users.map(u => u.id);
      if (!ids.length) return message.reply("Tag user đi: `!set owners @user`");
      ownersData[message.guild.id] = [...new Set([...(ownersData[message.guild.id] || []), ...ids])];
      saveOwners();
      return message.reply(`✅ Bạn Đã Có Quyền Bot Owner`);
    }

    if (name === "owners") {
      const list = ownersData[message.guild.id] || [];
      return message.reply(list.length ? `Owner quyền cao: ${list.map(i => `<@${i}>`).join(", ")}` : "Chưa có owner nào");
    }
    if (name === "removeowner") {
      if (!isOwner) return message.reply("Chỉ Owner mới gỡ được");
      const ids = message.mentions.users.map(u => u.id);
      ownersData[message.guild.id] = (ownersData[message.guild.id] || []).filter(x => !ids.includes(x));
      saveOwners();
      return message.reply("Đã gỡ owner");
    }
    if (name === "mute") {
      if (!isOwner) return message.reply("Chỉ Owner");
      const m = message.mentions.members.first(); if (!m) return;
      await m.timeout(10 * 60 * 1000); return message.reply(`Muted ${m}`);
    }
    if (name === "unmute") {
      if (!isOwner) return message.reply("Chỉ Owner");
      const m = message.mentions.members.first(); if (!m) return;
      await m.timeout(null); return message.reply(`Unmuted ${m}`);
    }
    if (name === "ban") {
      if (!isOwner) return message.reply("Chỉ Owner");
      const u = message.mentions.users.first(); if (!u) return;
      await message.guild.bans.create(u.id); return message.reply(`Banned ${u.tag}`);
    }
    if (name === "unban") {
      if (!isOwner) return message.reply("Chỉ Owner");
      if (!args[0]) return;
      await message.guild.bans.remove(args[0]); return message.reply(`Unbanned ${args[0]}`);
    }
    if (name === "join") {
      const vc = message.member?.voice.channel; if (!vc) return message.reply("Vào voice trước đi ní!");
      leave(voice, message.guild.id);
      const conn = joinVoiceChannel({ channelId: vc.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, group: voice.group, selfDeaf: true, selfMute: false });
      voice.setConnection(message.guild.id, conn); return message.reply(`🥽 Đã vào **${vc.name}**`);
    }
    if (name === "leave") {
      if (!isOwner) return message.reply("Chỉ Owner");
      leave(voice, message.guild.id); return message.reply("Đã rời voice");
    }
  });

  client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    if (i.commandName === "help") {
      const panel = new ContainerBuilder().setAccentColor(0x00FF7F)
        .addTextDisplayComponents(t => t.setContent(`## 🥽 GES VR BOT - FULL LỆNH`))
        .addTextDisplayComponents(t => t.setContent(`**🎙️ Voice**\n\`!join\` - Vào voice\n\`!leave\` - Rời voice\n\n**🔒 Channel (Chỉ Owner)**\n\`!lock\` - Khóa kênh\n\`!unlock\` - Mở khóa\n\n**👤 Info**\n\`/avatar @user\` - Xem avatar\n\`/banner @user\` - Xem banner\n\n**🛠️ Quản lý (Chỉ Owner)**\n\`!setowner @user\` / \`!set owners @user\`\n\`!owners\` - List owner\n\`!mute\` \`!unmute\` \`!ban\` \`!unban\`\n\n**🤖 Bot**\n\`!set avatar\` - Đổi avatar\n\`!set banner\` / \`!set banner ảo\`\n\n**🔗 Link: ${INVITE_LINK}**`));
      return i.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
    const targetId = i.options.getUser("user")?.id ?? i.user.id;
    const user = await client.users.fetch(targetId, { force: true });
    if (i.commandName === "avatar") {
      const url = user.displayAvatarURL({ size: 1024 });
      const panel = new ContainerBuilder().setAccentColor(0x00FF7F).addTextDisplayComponents(t => t.setContent(`**Avatar ${user.tag}**`)).addMediaGalleryComponents(g => g.addItems(x => x.setURL(url)));
      return i.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
    if (i.commandName === "banner") {
      let url = user.bannerURL({ size: 1024 });
      if (user.id === client.user.id && fakeBanners[user.id]) url = fakeBanners[user.id];
      if (!url) return i.editReply("Chưa có banner");
      const panel = new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(t => t.setContent(`**Banner của ${user.tag}** ${user.id === client.user.id && fakeBanners[user.id] ? '(Ảo)' : ''}`)).addMediaGalleryComponents(g => g.addItems(x => x.setURL(url)));
      return i.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
  });

  await client.login(token);
  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: [avatarCmd.toJSON(), bannerCmd.toJSON(), helpCmd.toJSON()] });
  return client;
}

const t1 = process.env.TOKEN || process.env.DISCORD_TOKEN;
const t2 = process.env.DISCORD_TOKEN2;
if (!t1) throw new Error("Thiếu TOKEN");
await startBot(t1, "GES-1");
if (t2) await startBot(t2, "GES-2");
console.log("GES VR Bot Ready");
