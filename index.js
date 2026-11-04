import "dotenv/config";
import express from "express";
import fs from "fs";
import { ActivityType, Client, ContainerBuilder, GatewayIntentBits, MessageFlags, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";

// WEB SERVER RENDER
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
let ownersData = {}; let fakeBanners = {};
try { ownersData = JSON.parse(fs.readFileSync(OWNER_FILE,"utf8")); } catch {}
try { fakeBanners = JSON.parse(fs.readFileSync(FAKE_BANNER_FILE,"utf8")); } catch {}
function saveOwners(){ fs.writeFileSync(OWNER_FILE, JSON.stringify(ownersData)); }
function saveFake(){ fs.writeFileSync(FAKE_BANNER_FILE, JSON.stringify(fakeBanners)); }

class VoiceManager { constructor(g){ this.group=g; this.connections=new Map(); } getConnection(id){ return this.connections.get(id); } setConnection(id,c){ this.connections.set(id,c); } removeConnection(id){ this.connections.delete(id); } }
function leave(voice, guildId){ const c = voice.getConnection(guildId); voice.removeConnection(guildId); if(c) try{ c.destroy(); } catch{} }

const avatarCmd = new SlashCommandBuilder().setName("avatar").setDescription("Xem avatar").addUserOption(o=>o.setName("user").setDescription("user").setRequired(false));
const bannerCmd = new SlashCommandBuilder().setName("banner").setDescription("Xem banner").addUserOption(o=>o.setName("user").setDescription("user").setRequired(false));
const helpCmd = new SlashCommandBuilder().setName("help").setDescription("Xem tất cả lệnh");

async function startBot(token, label){
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const voice = new VoiceManager(label);
  client.once("ready", ()=>{ console.log(`[${label}] Online ${client.user.tag}`); client.user.setPresence({ status: "online", activities: [{ name: "🥽 VR | Join GES", type: ActivityType.Watching }] }); });

  client.on("messageCreate", async (message)=>{
    if(message.author.bot || !message.guild) return;
    const content = message.content.trim();
    if(!content.startsWith(PREFIX)) return;
    const [cmdName, ...args] = content.slice(1).split(/\s+/);
    const name = cmdName.toLowerCase();
    const isOwner = ownersData[message.guild.id]?.includes(message.author.id) || message.guild.ownerId === message.author.id;

    if(name==="help") return message.reply(`**🥽 GES VR BOT**\n\`!join\` / \`!leave\`\n\`!lock\` - Khóa kênh\n\`!unlock\` - Mở kênh\n\`!setowner\` \`!owners\` \`!mute\` \`!ban\`\n\`!set avatar [link/ảnh]\` - Đổi avatar\n\`!set banner [link/ảnh]\` - Đổi banner thật (cần Nitro) + tự lưu banner ảo\n\`!set banner ảo [link]\` - Set banner ảo không cần Nitro\nLink: ${INVITE_LINK}`);

    // ===== MỚI: LOCK / UNLOCK =====
    if(name==="lock" || name==="lockchannel"){
      if(!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("Cần quyền Manage Channels");
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      return message.reply(`🔒 Đã khóa ${message.channel}`);
    }
    if(name==="unlock" || name==="unlockchannel"){
      if(!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply("Cần quyền Manage Channels");
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      return message.reply(`🔓 Đã mở khóa ${message.channel}`);
    }

    if(name==="ges") return message.reply(INVITE_LINK);

    if(name==="set"){
      const sub = args[0]?.toLowerCase();
      if(!isOwner) return message.reply("Chỉ owner mới được đổi ní ơi!");
      if(sub==="avatar"){
        let url = message.attachments.first()?.url || args[1];
        if(!url) return message.reply("Gửi kèm ảnh: `!set avatar` + ảnh");
        try{ await client.user.setAvatar(url); return message.reply("✅ Đã đổi avatar! 🥽"); }catch(e){ return message.reply(`Lỗi: ${e.message}`); }
      }
      if(sub==="banner"){
        let url = message.attachments.first()?.url || args[1];
        let isAo = args.includes("ảo") || args.includes("ao");
        if(args[1]?.toLowerCase()==="ảo" || args[1]?.toLowerCase()==="ao") url = message.attachments.first()?.url || args[2];
        if(!url) return message.reply("Dùng: `!set banner https://link.png` hoặc `!set banner ảo https://link.png`");

        // Lưu banner ảo luôn để /banner hiện ngay
        fakeBanners[client.user.id] = url;
        saveFake();

        if(isAo){
          return message.reply(`✅ Đã set banner ẢO: ${url} (Dùng /banner @bot để xem)`);
        }
        // Thử set banner thật
        try{
          await client.user.setBanner(url);
          return message.reply(`✅ Đã đổi banner THẬT + ẢO luôn! (Nếu bot có Nitro sẽ đổi thật, không thì vẫn hiện ảo)`);
        }catch(e){
          return message.reply(`⚠️ Banner thật cần Nitro nên lỗi: ${e.message}\nNhưng tui đã lưu banner ẢO rồi, gõ \`/banner @bot\` là thấy ngay! ✅\nLink ảo: ${url}`);
        }
      }
    }
    if(name==="setowner"){ const ids = message.mentions.users.map(u=>u.id); if(!ids.length) return message.reply("Tag user"); ownersData[message.guild.id] = [...new Set([...(ownersData[message.guild.id]||[]), ...ids])]; saveOwners(); return message.reply(`Đã set owner: ${ids.map(i=>`<@${i}>`).join(", ")}`); }
    if(name==="owners"){ const list = ownersData[message.guild.id]||[]; return message.reply(list.length ? `Owner: ${list.map(i=>`<@${i}>`).join(", ")}` : "Chưa có"); }
    if(name==="removeowner"){ const ids = message.mentions.users.map(u=>u.id); ownersData[message.guild.id] = (ownersData[message.guild.id]||[]).filter(x=>!ids.includes(x)); saveOwners(); return message.reply("Đã gỡ"); }
    if(name==="mute"){ const m = message.mentions.members.first(); if(!m) return; await m.timeout(10*60*1000); return message.reply(`Muted ${m}`); }
    if(name==="unmute"){ const m = message.mentions.members.first(); if(!m) return; await m.timeout(null); return message.reply(`Unmuted ${m}`); }
    if(name==="ban"){ const u = message.mentions.users.first(); if(!u) return; await message.guild.bans.create(u.id); return message.reply(`Banned ${u.tag}`); }
    if(name==="unban"){ if(!args[0]) return; await message.guild.bans.remove(args[0]); return message.reply(`Unbanned ${args[0]}`); }
    if(name==="join"){
      const vc = message.member?.voice.channel;
      if(!vc) return message.reply("Vào voice trước đi ní!");
      leave(voice, message.guild.id);
      const conn = joinVoiceChannel({ channelId: vc.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, group: voice.group, selfDeaf:true, selfMute:false });
      voice.setConnection(message.guild.id, conn);
      return message.reply(`🥽 Đã vào **${vc.name}**`);
    }
    if(name==="leave"){ leave(voice, message.guild.id); return message.reply("Đã rời voice"); }
  });

  client.on("interactionCreate", async (i)=>{
    if(!i.isChatInputCommand()) return;
    await i.deferReply();
    if(i.commandName==="help"){
      const panel = new ContainerBuilder().setAccentColor(0x00FF7F).addTextDisplayComponents(t=>t.setContent(`## 🥽 GES VR BOT\n**!lock** khóa kênh, **!unlock** mở\n**!set banner ảo [link]** đổi banner ảo không cần Nitro`));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
    const targetId = i.options.getUser("user")?.id ?? i.user.id;
    const user = await client.users.fetch(targetId, {force:true});
    if(i.commandName==="avatar"){
      const url = user.displayAvatarURL({size:1024});
      const panel = new ContainerBuilder().setAccentColor(0x00FF7F).addTextDisplayComponents(t=>t.setContent(`**Avatar ${user.tag}**`)).addMediaGalleryComponents(g=>g.addItems(x=>x.setURL(url)));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
    if(i.commandName==="banner"){
      // Nếu xem banner bot mà có banner ảo thì hiện banner ảo
      let url = user.bannerURL({size:1024});
      if(user.id === client.user.id && fakeBanners[user.id]) url = fakeBanners[user.id];
      if(!url) return i.editReply("Chưa có banner");
      const panel = new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(t=>t.setContent(`**Banner của ${user.tag}** ${user.id===client.user.id && fakeBanners[user.id] ? '(Ảo)' : ''}`)).addMediaGalleryComponents(g=>g.addItems(x=>x.setURL(url)));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
  });

  await client.login(token);
  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: [avatarCmd.toJSON(), bannerCmd.toJSON(), helpCmd.toJSON()] });
  return client;
}

const t1 = process.env.TOKEN || process.env.DISCORD_TOKEN;
const t2 = process.env.DISCORD_TOKEN2;
if(!t1) throw new Error("Thiếu TOKEN");
await startBot(t1, "GES-1");
if(t2) await startBot(t2, "GES-2");
console.log("GES VR Bot Ready");
