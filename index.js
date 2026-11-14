import "dotenv/config";
import express from "express";
import fs from "fs";
import { ActivityType, AuditLogEvent, Client, ContainerBuilder, GatewayIntentBits, MessageFlags, PermissionsBitField, REST, Routes, SlashCommandBuilder } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";
const app = express();
app.get("/", (req, res) => res.send("Mat Chat Gang Bot Running - OK"));
app.get("/ping", (req, res) => res.send("pong"));
app.listen(process.env.PORT || 10000, () => console.log(`Web server on ${process.env.PORT || 10000}`));
const PREFIX = "!";
const INVITE_LINK = "https://discord.gg/TK2JfvWduq";
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const OWNER_FILE = "./data/owners.json";
const FAKE_BANNER_FILE = "./data/fakebanner.json";
const TRAP_FILE = "./data/trap.json";
const ANTINUKE_FILE = "./data/antinuke.json";
const WHITELIST_FILE = "./data/whitelist.json";
let ownersData = {};
let fakeBanners = {};
let trapChannels = {};
let antinukeData = {};
let whitelistData = {};
try { ownersData = JSON.parse(fs.readFileSync(OWNER_FILE, "utf8")); } catch {}
try { fakeBanners = JSON.parse(fs.readFileSync(FAKE_BANNER_FILE, "utf8")); } catch {}
try { trapChannels = JSON.parse(fs.readFileSync(TRAP_FILE, "utf8")); } catch {}
try { antinukeData = JSON.parse(fs.readFileSync(ANTINUKE_FILE, "utf8")); } catch {}
try { whitelistData = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf8")); } catch {}
function saveOwners() { fs.writeFileSync(OWNER_FILE, JSON.stringify(ownersData)); }
function saveFake() { fs.writeFileSync(FAKE_BANNER_FILE, JSON.stringify(fakeBanners)); }
function saveTrap() { fs.writeFileSync(TRAP_FILE, JSON.stringify(trapChannels)); }
function saveAntinuke() { fs.writeFileSync(ANTINUKE_FILE, JSON.stringify(antinukeData)); }
function saveWhitelist() { fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelistData)); }
function getAnti(guildId) {
  if (!antinukeData[guildId]) {
    antinukeData[guildId] = { enabled: true, antiBotInvite: true, antiWebhook: true, antiMassMention: true, banLimit: 3, kickLimit: 3, channelLimit: 3, roleLimit: 3, webhookLimit: 2, timeWindow: 10000, punish: "ban", logChannel: null };
    saveAntinuke();
  }
  return antinukeData[guildId];
}
function isWhitelisted(guildId, userId, guild) {
  if (guild && guild.ownerId === userId) return true;
  if ((ownersData[guildId] || []).includes(userId)) return true;
  if ((whitelistData[guildId] || []).includes(userId)) return true;
  return false;
}
function getLogChannel(guild) {
  const cfg = getAnti(guild.id);
  if (cfg.logChannel) return guild.channels.cache.get(cfg.logChannel);
  return guild.channels.cache.find(c => c.name.includes("log") || c.name.includes("anti")) || guild.systemChannel;
}
async function sendLog(guild, text) {
  try {
    const ch = getLogChannel(guild);
    if (ch && ch.isTextBased()) await ch.send(text).catch(() => {});
  } catch {}
}
const actionTracker = new Map();
function trackAction(guildId, userId, type, limit, windowMs) {
  if (!actionTracker.has(guildId)) actionTracker.set(guildId, new Map());
  const g = actionTracker.get(guildId);
  if (!g.has(userId)) g.set(userId, {});
  const u = g.get(userId);
  if (!u[type]) u[type] = [];
  const now = Date.now();
  u[type] = u[type].filter(t => now - t < windowMs);
  u[type].push(now);
  return u[type].length >= limit;
}
async function punishNuker(guild, userId, reason) {
  const cfg = getAnti(guild.id);
  try {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;
    if (!member.bannable && !member.moderatable) return;
    if (cfg.punish === "ban") await member.ban({ reason: `Anti-Nuke: ${reason}` }).catch(() => {});
    else if (cfg.punish === "kick") await member.kick(`Anti-Nuke: ${reason}`).catch(() => {});
    else await member.timeout(60 * 60 * 1000, `Anti-Nuke: ${reason}`).catch(() => {});
    await sendLog(guild, `🛡️ **ANTI-NUKE** Đã xử lý <@${userId}> (${userId}) - ${reason} - Hình phạt: ${cfg.punish}`);
  } catch {}
}
async function getExecutor(guild, auditType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry) return null;
    if (Date.now() - entry.createdTimestamp > 10000) return null;
    return entry.executor;
  } catch { return null; }
}
class VoiceManager { constructor(g) { this.group = g; this.connections = new Map(); } getConnection(id) { return this.connections.get(id); } setConnection(id, c) { this.connections.set(id, c); } removeConnection(id) { this.connections.delete(id); } }
function leave(voice, guildId) { const c = voice.getConnection(guildId); voice.removeConnection(guildId); if (c) try { c.destroy(); } catch {} }
const avatarCmd = new SlashCommandBuilder().setName("avatar").setDescription("Xem avatar").addUserOption(o => o.setName("user").setDescription("user").setRequired(false));
const bannerCmd = new SlashCommandBuilder().setName("banner").setDescription("Xem banner").addUserOption(o => o.setName("user").setDescription("user").setRequired(false));
const helpCmd = new SlashCommandBuilder().setName("help").setDescription("Xem tất cả lệnh của bot Mất Chất Gang");
async function startBot(token, label) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildWebhooks, GatewayIntentBits.GuildInvites] });
  const voice = new VoiceManager(label);
  client.once("ready", () => { console.log(`[${label}] Online ${client.user.tag}`); client.user.setPresence({ status: "online", activities: [{ name: "Mất Chất Gang | !gang", type: ActivityType.Watching }] }); });
  client.on("guildBanAdd", async (ban) => {
    const cfg = getAnti(ban.guild.id);
    if (!cfg.enabled) return;
    const exec = await getExecutor(ban.guild, AuditLogEvent.MemberBanAdd);
    if (!exec || exec.id === client.user.id || isWhitelisted(ban.guild.id, exec.id, ban.guild)) return;
    if (trackAction(ban.guild.id, exec.id, "ban", cfg.banLimit, cfg.timeWindow)) await punishNuker(ban.guild, exec.id, `Ban hàng loạt ${cfg.banLimit} người / ${cfg.timeWindow / 1000}s`);
  });
  client.on("guildMemberRemove", async (member) => {
    const cfg = getAnti(member.guild.id);
    if (!cfg.enabled) return;
    const exec = await getExecutor(member.guild, AuditLogEvent.MemberKick);
    if (!exec || exec.id === client.user.id || isWhitelisted(member.guild.id, exec.id, member.guild)) return;
    if (trackAction(member.guild.id, exec.id, "kick", cfg.kickLimit, cfg.timeWindow)) await punishNuker(member.guild, exec.id, `Kick hàng loạt ${cfg.kickLimit} người / ${cfg.timeWindow / 1000}s`);
  });
  client.on("channelDelete", async (ch) => {
    if (!ch.guild) return;
    const cfg = getAnti(ch.guild.id);
    if (!cfg.enabled) return;
    const exec = await getExecutor(ch.guild, AuditLogEvent.ChannelDelete);
    if (!exec || exec.id === client.user.id || isWhitelisted(ch.guild.id, exec.id, ch.guild)) return;
    if (trackAction(ch.guild.id, exec.id, "channel", cfg.channelLimit, cfg.timeWindow)) await punishNuker(ch.guild, exec.id, `Xóa ${cfg.channelLimit} kênh / ${cfg.timeWindow / 1000}s`);
  });
  client.on("channelCreate", async (ch) => {
    if (!ch.guild) return;
    const cfg = getAnti(ch.guild.id);
    if (!cfg.enabled) return;
    const exec = await getExecutor(ch.guild, AuditLogEvent.ChannelCreate);
    if (!exec || exec.id === client.user.id || isWhitelisted(ch.guild.id, exec.id, ch.guild)) return;
    if (trackAction(ch.guild.id, exec.id, "channel", cfg.channelLimit, cfg.timeWindow)) {
      await punishNuker(ch.guild, exec.id, `Tạo ${cfg.channelLimit} kênh / ${cfg.timeWindow / 1000}s`);
      try { await ch.delete("Anti-Nuke").catch(() => {}); } catch {}
    }
  });
  client.on("roleDelete", async (role) => {
    const cfg = getAnti(role.guild.id);
    if (!cfg.enabled) return;
    const exec = await getExecutor(role.guild, AuditLogEvent.RoleDelete);
    if (!exec || exec.id === client.user.id || isWhitelisted(role.guild.id, exec.id, role.guild)) return;
    if (trackAction(role.guild.id, exec.id, "role", cfg.roleLimit, cfg.timeWindow)) await punishNuker(role.guild, exec.id, `Xóa ${cfg.roleLimit} role / ${cfg.timeWindow / 1000}s`);
  });
  client.on("roleCreate", async (role) => {
    const cfg = getAnti(role.guild.id);
    if (!cfg.enabled) return;
    const exec = await getExecutor(role.guild, AuditLogEvent.RoleCreate);
    if (!exec || exec.id === client.user.id || isWhitelisted(role.guild.id, exec.id, role.guild)) return;
    if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
      try { await role.delete("Anti-Nuke: Role Admin lạ").catch(() => {}); } catch {}
      await sendLog(role.guild, `🛡️ Đã xóa role Admin lạ **${role.name}** tạo bởi <@${exec.id}>`);
      if (!isWhitelisted(role.guild.id, exec.id, role.guild)) await punishNuker(role.guild, exec.id, "Tạo role Admin");
      return;
    }
    if (trackAction(role.guild.id, exec.id, "role", cfg.roleLimit, cfg.timeWindow)) await punishNuker(role.guild, exec.id, `Tạo ${cfg.roleLimit} role / ${cfg.timeWindow / 1000}s`);
  });
  client.on("guildMemberUpdate", async (oldM, newM) => {
    const cfg = getAnti(newM.guild.id);
    if (!cfg.enabled) return;
    const hadAdmin = oldM.permissions.has(PermissionsBitField.Flags.Administrator);
    const hasAdmin = newM.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!hadAdmin && hasAdmin) {
      const exec = await getExecutor(newM.guild, AuditLogEvent.MemberRoleUpdate);
      if (!exec || exec.id === client.user.id || isWhitelisted(newM.guild.id, exec.id, newM.guild)) return;
      try { await newM.roles.set(oldM.roles.cache.map(r => r.id), "Anti-Nuke: Gỡ Admin lạ").catch(() => {}); } catch {}
      await punishNuker(newM.guild, exec.id, `Cấp Admin cho ${newM.user.tag}`);
    }
  });
  client.on("webhookUpdate", async (ch) => {
    if (!ch.guild) return;
    const cfg = getAnti(ch.guild.id);
    if (!cfg.enabled || !cfg.antiWebhook) return;
    const exec = await getExecutor(ch.guild, AuditLogEvent.WebhookCreate);
    if (!exec || exec.id === client.user.id || isWhitelisted(ch.guild.id, exec.id, ch.guild)) return;
    const hit = trackAction(ch.guild.id, exec.id, "webhook", cfg.webhookLimit, cfg.timeWindow);
    try {
      const webs = await ch.fetchWebhooks().catch(() => null);
      if (webs) for (const [, w] of webs) if (w.owner?.id === exec.id) await w.delete("Anti-Nuke Webhook").catch(() => {});
    } catch {}
    if (hit) await punishNuker(ch.guild, exec.id, `Tạo ${cfg.webhookLimit} webhook / ${cfg.timeWindow / 1000}s`);
    else await sendLog(ch.guild, `🛡️ Đã xóa webhook lạ ở ${ch} tạo bởi <@${exec.id}>`);
  });
  client.on("guildMemberAdd", async (member) => {
    if (!member.user.bot) return;
    const cfg = getAnti(member.guild.id);
    if (!cfg.enabled || !cfg.antiBotInvite) return;
    if (member.id === client.user.id) return;
    const exec = await getExecutor(member.guild, AuditLogEvent.BotAdd);
    if (exec && isWhitelisted(member.guild.id, exec.id, member.guild)) return;
    try {
      await member.kick("Anti Bot Invite: Bot lạ không được mời");
      await sendLog(member.guild, `🤖 **ANTI-BOT** Đã kick bot lạ **${member.user.tag}** (mời bởi ${exec ? `<@${exec.id}>` : "không rõ"})`);
    } catch {}
  });
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    const cfg = getAnti(message.guild.id);
    if (cfg.enabled && cfg.antiBotInvite && !isWhitelisted(message.guild.id, message.author.id, message.guild)) {
      const lower = message.content.toLowerCase();
      const isBotInvite = (lower.includes("discord.com/oauth2") || lower.includes("discordapp.com/oauth2") || lower.includes("discord.com/api/oauth2")) && (lower.includes("bot") || lower.includes("scope="));
      if (isBotInvite) {
        await message.delete().catch(() => {});
        await message.channel.send(`❌ <@${message.author.id}> Không được gửi link mời bot ở đây!`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
        return;
      }
    }
    if (cfg.enabled && cfg.antiMassMention && !isWhitelisted(message.guild.id, message.author.id, message.guild)) {
      if (message.mentions.users.size >= 5 || message.mentions.roles.size >= 3 || message.mentions.everyone) {
        await message.delete().catch(() => {});
        try { await message.member.timeout(5 * 60 * 1000, "Anti Mass Mention").catch(() => {}); } catch {}
        await message.channel.send(`⚠️ <@${message.author.id}> Spam tag, đã mute 5p`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
        return;
      }
    }
    const traps = trapChannels[message.guild.id] || [];
    if (traps.includes(message.channel.id)) {
      const owners = ownersData[message.guild.id] || [];
      const isExempt = owners.includes(message.author.id) || message.guild.ownerId === message.author.id;
      if (!isExempt) {
        try { await message.delete().catch(() => {}); const member = await message.guild.members.fetch(message.author.id).catch(() => null); if (member && member.kickable) await member.kick(`Honey Trap: Nhắn vào kênh bẫy ${message.channel.name}`); } catch {}
        return;
      }
    }
    const content = message.content.trim();
    if (!content.startsWith(PREFIX)) return;
    let cmdName = content.slice(1).split(/\s+/)[0].toLowerCase();
    let args = content.slice(1).split(/\s+/).slice(1);
    let name = cmdName;
    if (name === "set" && (args[0]?.toLowerCase() === "owner" || args[0]?.toLowerCase() === "owners")) { name = "setowner"; args = args.slice(1); }
    if (name === "setowners" || name === "addowner") name = "setowner";
    if (name === "removeowners") name = "removeowner";
    if (name === "band" || name === "bann") name = "ban";
    if (name === "unband") name = "unban";
    if (name === "antinuke" || name === "anti-nuke") name = "antinuke";
    const owners = ownersData[message.guild.id] || [];
    const isOwner = owners.includes(message.author.id) || message.guild.ownerId === message.author.id;
    if (name === "antinuke") {
      if (!isOwner) return message.reply("❌ Chỉ Owner mới chỉnh Anti-Nuke!");
      const sub = args[0]?.toLowerCase();
      const c = getAnti(message.guild.id);
      if (!sub || sub === "status" || sub === "info") {
        return message.reply(`**🛡️ ANTI-NUKE - ${c.enabled ? "BẬT" : "TẮT"}**\nBan: ${c.banLimit} / ${c.timeWindow / 1000}s | Kick: ${c.kickLimit}\nKênh: ${c.channelLimit} | Role: ${c.roleLimit} | Webhook: ${c.webhookLimit}\nAnti Bot Invite: ${c.antiBotInvite ? "BẬT" : "TẮT"} | Anti Webhook: ${c.antiWebhook ? "BẬT" : "TẮT"}\nHình phạt: ${c.punish}\nDùng: \`!antinuke on/off\` | \`!antinuke punish ban/kick/timeout\` | \`!antinuke log #kênh\``);
      }
      if (sub === "on") { c.enabled = true; saveAntinuke(); return message.reply("✅ Đã BẬT Anti-Nuke"); }
      if (sub === "off") { c.enabled = false; saveAntinuke(); return message.reply("⚠️ Đã TẮT Anti-Nuke"); }
      if (sub === "punish") {
        const v = args[1]?.toLowerCase();
        if (!["ban", "kick", "timeout"].includes(v)) return message.reply("Dùng: `!antinuke punish ban/kick/timeout`");
        c.punish = v; saveAntinuke(); return message.reply(`✅ Hình phạt Anti-Nuke: **${v}**`);
      }
      if (sub === "log") {
        const ch = message.mentions.channels.first();
        if (!ch) return message.reply("Tag kênh: `!antinuke log #kênh-log`");
        c.logChannel = ch.id; saveAntinuke(); return message.reply(`✅ Log Anti-Nuke: ${ch}`);
      }
      if (sub === "bot" || sub === "antibot") {
        c.antiBotInvite = args[1]?.toLowerCase() !== "off"; saveAntinuke();
        return message.reply(`🤖 Anti Bot Invite: **${c.antiBotInvite ? "BẬT" : "TẮT"}**`);
      }
      return message.reply("Dùng: `!antinuke on/off/status/punish/log/bot`");
    }
    if (name === "whitelist" || name === "wl") {
      if (!isOwner) return message.reply("❌ Chỉ Owner!");
      const sub = args[0]?.toLowerCase();
      const ids = message.mentions.users.map(u => u.id);
      if (!whitelistData[message.guild.id]) whitelistData[message.guild.id] = [];
      if (sub === "add") {
        if (!ids.length) return message.reply("Tag user: `!whitelist add @user`");
        whitelistData[message.guild.id] = [...new Set([...whitelistData[message.guild.id], ...ids])];
        saveWhitelist(); return message.reply(`✅ Đã whitelist ${ids.map(i => `<@${i}>`).join(", ")} - Người này sẽ không bị Anti-Nuke xử`);
      }
      if (sub === "remove" || sub === "del") {
        whitelistData[message.guild.id] = whitelistData[message.guild.id].filter(x => !ids.includes(x));
        saveWhitelist(); return message.reply("✅ Đã gỡ whitelist");
      }
      if (sub === "list" || !sub) {
        const list = whitelistData[message.guild.id] || [];
        return message.reply(list.length ? `🤍 Whitelist: ${list.map(i => `<@${i}>`).join(", ")}` : "Chưa có ai whitelist");
      }
    }
    if (name === "antibot") {
      if (!isOwner) return message.reply("❌ Chỉ Owner!");
      const c = getAnti(message.guild.id);
      const v = args[0]?.toLowerCase();
      if (v === "off") c.antiBotInvite = false; else c.antiBotInvite = true;
      saveAntinuke(); return message.reply(`🤖 Anti Bot Invite: **${c.antiBotInvite ? "BẬT" : "TẮT"}** - Bot lạ vào là kick ngay`);
    }
    if (name === "help") {
      return message.reply(`**MẤT CHẤT GANG BOT - FULL LỆNH**\n\n**🎙️ Voice:**\n\`!join\` - Bot vào voice\n\`!leave\` - Bot rời voice\n\n**🛡️ Anti-Nuke / Anti-Raid (Chỉ Owner):**\n\`!antinuke\` - Xem trạng thái\n\`!antinuke on/off\` - Bật / Tắt Anti-Nuke\n\`!antinuke punish ban/kick/timeout\` - Đổi hình phạt\n\`!antinuke log #kênh\` - Set kênh log\n\`!antinuke bot on/off\` - Bật / Tắt Anti Bot Invite\n\`!antibot on/off\` - Chặn bot lạ vào server\n\`!whitelist add @user\` - Miễn Anti-Nuke\n\`!whitelist remove @user\` - Gỡ whitelist\n\`!whitelist list\` - Xem whitelist\n\n**🔒 Channel (Chỉ Owner):**\n\`!lock\` - Khóa kênh hiện tại\n\`!unlock\` - Mở khóa kênh\n\n**🍯 Honey Trap (Chỉ Owner):**\n\`!settrap #kênh\` - Đặt kênh bẫy, ai nhắn là kick + xóa\n\`!removetrap #kênh\` - Gỡ bẫy\n\`!traps\` - Xem list kênh bẫy\n\n**👤 Thông tin:**\n\`/avatar @user\` - Xem avatar\n\`/banner @user\` - Xem banner\n\`/help\` - Xem bảng này\n\n**🛠️ Quản lý (Chỉ Owner):**\n\`!setowner @user\` / \`!set owners @user\` - Thêm owner\n\`!removeowner @user\` - Gỡ owner\n\`!owners\` - Xem danh sách owner\n\`!mute @user\` - Mute 10p\n\`!unmute @user\`\n\`!ban @user\` / \`!ban ID\` / \`!band @user\` - Ban\n\`!unban ID\`\n\n**🤖 Bot Owner:**\n\`!set avatar [ảnh]\` - Đổi avatar bot\n\`!set banner [link]\` - Đổi banner thật\n\`!set banner ảo [link]\` - Đổi banner ảo (ko cần Nitro)\n\n**🔗 Gang:**\n\`!gang\` - Link discord Mất Chất Gang\n${INVITE_LINK}`);
    }
    if (name === "settrap") { if (!isOwner) return message.reply("❌ Chỉ Owner mới được đặt bẫy ní ơi!"); const ch = message.mentions.channels.first() || message.channel; if (!trapChannels[message.guild.id]) trapChannels[message.guild.id] = []; if (trapChannels[message.guild.id].includes(ch.id)) return message.reply(`Kênh ${ch} đã là bẫy rồi!`); trapChannels[message.guild.id].push(ch.id); saveTrap(); return message.reply(`🍯 Đã đặt bẫy ở ${ch}\n⚠️ Ai nhắn vô đây (trừ Owner) sẽ bị **KICK + XÓA TIN** ngay lập tức!`); }
    if (name === "removetrap") { if (!isOwner) return message.reply("❌ Chỉ Owner mới gỡ được!"); const ch = message.mentions.channels.first() || message.channel; trapChannels[message.guild.id] = (trapChannels[message.guild.id] || []).filter(id => id !== ch.id); saveTrap(); return message.reply(`✅ Đã gỡ bẫy ở ${ch}`); }
    if (name === "traps") { const list = trapChannels[message.guild.id] || []; if (!list.length) return message.reply("Chưa có kênh bẫy nào. Dùng `!settrap #kênh`"); return message.reply(`🍯 Kênh bẫy: ${list.map(id => `<#${id}>`).join(", ")}`); }
    if (name === "lock" || name === "lockchannel") { if (!isOwner) return message.reply("❌ Chỉ Owner (`!set owners`) mới được khóa kênh ní ơi!"); await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false }); return message.reply(`🔒 Đã khóa ${message.channel} | Chỉ Owner mới mở được`); }
    if (name === "unlock" || name === "unlockchannel") { if (!isOwner) return message.reply("❌ Chỉ Owner mới được mở khóa!"); await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null }); return message.reply(`🔓 Đã mở khóa ${message.channel}`); }
    if (name === "gang") return message.reply(`**🔗 Mất Chất Gang:**\n${INVITE_LINK}`);
    if (name === "set") {
      const sub = args[0]?.toLowerCase();
      if (!isOwner) return message.reply("Chỉ owner mới được đổi ní ơi!");
      if (sub === "avatar") {
        let url = message.attachments.first()?.url || args[1];
        if (!url) return message.reply("Gửi kèm ảnh: `!set avatar` + ảnh");
        try { await client.user.setAvatar(url); return message.reply("✅ Đã đổi avatar!"); } catch (e) { return message.reply(`Lỗi: ${e.message}`); }
      }
      if (sub === "banner") {
        let isAo = args.includes("ảo") || args.includes("ao");
        let url = message.attachments.first()?.url || args[1];
        if (args[1]?.toLowerCase() === "ảo" || args[1]?.toLowerCase() === "ao") url = message.attachments.first()?.url || args[2];
        if (!url) return message.reply("Dùng: `!set banner https://link.png` hoặc `!set banner ảo https://link.png`");
        fakeBanners[client.user.id] = url; saveFake();
        if (isAo) return message.reply(`✅ Đã set banner ẢO: ${url}`);
        try { await client.user.setBanner(url); return message.reply(`✅ Đã đổi cả THẬT + ẢO!`); } catch (e) { return message.reply(`⚠️ Thật cần Nitro nên lỗi: ${e.message}\nNhưng đã lưu ẢO rồi, /banner @bot là thấy!`); }
      }
    }
    if (name === "setowner") { if (owners.length > 0 && !isOwner) return message.reply("❌ Chỉ Owner mới được thêm owner khác!"); const ids = message.mentions.users.map(u => u.id); if (!ids.length) return message.reply("Tag user đi: `!set owners @user`"); ownersData[message.guild.id] = [...new Set([...(ownersData[message.guild.id] || []), ...ids])]; saveOwners(); return message.reply(`✅ Bạn Đã Có Quyền Bot Owner`); }
    if (name === "owners") { const list = ownersData[message.guild.id] || []; return message.reply(list.length ? `Owner quyền cao: ${list.map(i => `<@${i}>`).join(", ")}` : "Chưa có owner nào"); }
    if (name === "removeowner") { if (!isOwner) return message.reply("Chỉ Owner mới gỡ được"); const ids = message.mentions.users.map(u => u.id); ownersData[message.guild.id] = (ownersData[message.guild.id] || []).filter(x => !ids.includes(x)); saveOwners(); return message.reply("Đã gỡ owner"); }
    if (name === "mute") { if (!isOwner) return message.reply("Chỉ Owner"); const m = message.mentions.members.first(); if (!m) return message.reply("Tag user đi: `!mute @user`"); await m.timeout(10 * 60 * 1000); return message.reply(`Muted ${m}`); }
    if (name === "unmute") { if (!isOwner) return message.reply("Chỉ Owner"); const m = message.mentions.members.first(); if (!m) return; await m.timeout(null); return message.reply(`Unmuted ${m}`); }
    if (name === "ban") {
      if (!isOwner) return message.reply("❌ Chỉ Owner mới được ban!");
      let targetId = message.mentions.users.first()?.id || args[0]?.replace(/[<@!>]/g, "");
      if (!targetId) return message.reply("Dùng: `!ban @user` hoặc `!ban 123456789012345678` hoặc `!band @user`");
      if (!/^\d{17,19}$/.test(targetId)) return message.reply("❌ ID không đúng! ID phải là dãy số 17-19 số.");
      if (targetId === message.author.id) return message.reply("Không tự ban mình được ní ơi!");
      if (targetId === client.user.id) return message.reply("Không ban bot được!");
      try {
        const member = await message.guild.members.fetch(targetId).catch(() => null);
        if (member) { if (!member.bannable) return message.reply("❌ Bot không ban được người này! Role bot thấp hơn role người đó rồi, kéo role bot lên trên đi."); await member.ban({ reason: `Banned by ${message.author.tag}` }); }
        else { await message.guild.bans.create(targetId, { reason: `Banned by ${message.author.tag}` }); }
        const user = await client.users.fetch(targetId).catch(() => null);
        return message.reply(`🔨 Đã ban **${user ? user.tag : targetId}** (ID: ${targetId})`);
      } catch (e) { return message.reply(`❌ Lỗi ban: ${e.message}\nCheck bot có quyền Ban Members chưa ní!`); }
    }
    if (name === "unban") { if (!isOwner) return message.reply("Chỉ Owner"); const targetId = args[0]?.replace(/[<@!>]/g, ""); if (!targetId || !/^\d{17,19}$/.test(targetId)) return message.reply("Dùng: `!unban 123456789012345678`"); try { await message.guild.bans.remove(targetId); return message.reply(`✅ Đã unban ${targetId}`); } catch (e) { return message.reply(`Lỗi: ${e.message}`); } }
    if (name === "join") { const vc = message.member?.voice.channel; if (!vc) return message.reply("Vào voice trước đi ní!"); leave(voice, message.guild.id); const conn = joinVoiceChannel({ channelId: vc.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, group: voice.group, selfDeaf: true, selfMute: false }); voice.setConnection(message.guild.id, conn); return message.reply(`Đã vào **${vc.name}**`); }
    if (name === "leave") { if (!isOwner) return message.reply("Chỉ Owner"); leave(voice, message.guild.id); return message.reply("Đã rời voice"); }
  });
  client.on("interactionCreate", async (i) => {
    if (!i.isChatInputCommand()) return;
    await i.deferReply();
    if (i.commandName === "help") {
      const panel = new ContainerBuilder().setAccentColor(0x00FF7F).addTextDisplayComponents(t => t.setContent(`## MẤT CHẤT GANG BOT - FULL LỆNH`)).addTextDisplayComponents(t => t.setContent(`**🎙️ Voice**\n\`!join\` - Vào voice\n\`!leave\` - Rời voice\n\n**🛡️ Anti-Nuke**\n\`!antinuke\` - Xem trạng thái\n\`!antinuke on/off\` - Bật/Tắt\n\`!antinuke punish ban/kick/timeout\`\n\`!antinuke log #kênh\`\n\`!antibot on/off\` - Chặn bot lạ\n\`!whitelist add/remove/list @user\`\n\n**🔒 Channel (Chỉ Owner)**\n\`!lock\` - Khóa kênh\n\`!unlock\` - Mở khóa\n\n**🍯 Honey Trap**\n\`!settrap #kênh\` - Đặt bẫy kick + xóa\n\`!removetrap #kênh\` - Gỡ bẫy\n\`!traps\` - Xem bẫy\n\n**👤 Info**\n\`/avatar @user\` - Xem avatar\n\`/banner @user\` - Xem banner\n\n**🛠️ Quản lý (Chỉ Owner)**\n\`!setowner @user\` / \`!set owners @user\`\n\`!owners\` - List owner\n\`!mute\` \`!unmute\` \`!ban ID\` \`!band @user\` \`!unban\`\n\n**🤖 Bot**\n\`!set avatar\` - Đổi avatar\n\`!set banner\` / \`!set banner ảo\`\n\n**🔗 Gang**\n\`!gang\` - Link discord Mất Chất Gang\n${INVITE_LINK}`));
      return i.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    }
    const targetId = i.options.getUser("user")?.id ?? i.user.id;
    const user = await client.users.fetch(targetId, { force: true });
    if (i.commandName === "avatar") { const url = user.displayAvatarURL({ size: 1024 }); const panel = new ContainerBuilder().setAccentColor(0x00FF7F).addTextDisplayComponents(t => t.setContent(`**Avatar ${user.tag}**`)).addMediaGalleryComponents(g => g.addItems(x => x.setURL(url))); return i.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 }); }
    if (i.commandName === "banner") { let url = user.bannerURL({ size: 1024 }); if (user.id === client.user.id && fakeBanners[user.id]) url = fakeBanners[user.id]; if (!url) return i.editReply("Chưa có banner"); const panel = new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(t => t.setContent(`**Banner của ${user.tag}** ${user.id === client.user.id && fakeBanners[user.id] ? '(Ảo)' : ''}`)).addMediaGalleryComponents(g => g.addItems(x => x.setURL(url))); return i.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 }); }
  });
  await client.login(token);
  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: [avatarCmd.toJSON(), bannerCmd.toJSON(), helpCmd.toJSON()] });
  return client;
}
const t1 = process.env.TOKEN || process.env.DISCORD_TOKEN;
const t2 = process.env.DISCORD_TOKEN2;
if (!t1) throw new Error("Thiếu TOKEN");
await startBot(t1, "MCG-1");
if (t2) await startBot(t2, "MCG-2");
console.log("Mat Chat Gang Bot Ready");
