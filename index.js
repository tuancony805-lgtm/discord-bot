import "dotenv/config";
import fs from "fs";
import { ActivityType, Client, ContainerBuilder, GatewayIntentBits, MessageFlags, REST, Routes, SlashCommandBuilder } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";

const PREFIX = "!";
const INVITE_LINK = "https://discord.gg/J4v2WDsGjP";

// Data owner
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const OWNER_FILE = "./data/owners.json";
let ownersData = {};
try { ownersData = JSON.parse(fs.readFileSync(OWNER_FILE,"utf8")); } catch {}
function saveOwners(){ fs.writeFileSync(OWNER_FILE, JSON.stringify(ownersData)); }

class VoiceManager {
  constructor(g){ this.group=g; this.connections=new Map(); }
  getConnection(id){ return this.connections.get(id); }
  setConnection(id,c){ this.connections.set(id,c); }
  removeConnection(id){ this.connections.delete(id); }
}
function leave(voice, guildId){
  const c = voice.getConnection(guildId);
  voice.removeConnection(guildId);
  if(c) try{ c.destroy(); } catch{}
}

const avatarCmd = new SlashCommandBuilder().setName("avatar").setDescription("Xem avatar").addUserOption(o=>o.setName("user").setDescription("user").setRequired(false));
const bannerCmd = new SlashCommandBuilder().setName("banner").setDescription("Xem banner").addUserOption(o=>o.setName("user").setDescription("user").setRequired(false));

async function startBot(token, label){
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const voice = new VoiceManager(label);

  client.once("ready", ()=>{
    console.log(`[${label}] Online ${client.user.tag}`);
    // TRẠNG THÁI MÀU XANH + KÍNH VR + JOIN GES
    client.user.setPresence({
      status: "online", // màu xanh lá
      activities: [{
        name: `🥽 VR | Join GES`,
        type: ActivityType.Watching,
        state: "discord.gg/J4v2WDsGjP"
      }]
    });
  });

  client.on("messageCreate", async (message)=>{
    if(message.author.bot || !message.guild) return;
    const content = message.content.trim();
    if(!content.startsWith(PREFIX)) return;
    const [cmdName, ...args] = content.slice(1).split(/\s+/);
    const name = cmdName.toLowerCase();

    if(name==="help") return message.reply(`**GES VR BOT**\n\`!join\` - vào voice\n\`!leave\` - rời voice\n\`/avatar\` - xem avatar\n\`!ges\` - lấy link GES\n\n**Join GES:** ${INVITE_LINK}`);
    if(name==="ges") return message.reply(`🥽 **Join GES ngay:** ${INVITE_LINK}`);
    if(name==="setowner"){ const ids = message.mentions.users.map(u=>u.id); if(!ids.length) return message.reply("Tag user đi"); ownersData[message.guild.id] = [...new Set([...(ownersData[message.guild.id]||[]), ...ids])]; saveOwners(); return message.reply(`Đã set owner: ${ids.map(i=>`<@${i}>`).join(", ")}`); }
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
      return message.reply(`🥽 Đã vào **${vc.name}** | Join GES: ${INVITE_LINK}`);
    }
    if(name==="leave"){ leave(voice, message.guild.id); return message.reply("Đã rời voice"); }
  });

  client.on("interactionCreate", async (i)=>{
    if(!i.isChatInputCommand()) return;
    await i.deferReply();
    const targetId = i.options.getUser("user")?.id ?? i.user.id;
    const user = await client.users.fetch(targetId, {force:true});
    if(i.commandName==="avatar"){
      const url = user.displayAvatarURL({size:1024});
      const panel = new ContainerBuilder().setAccentColor(0x00FF7F).addTextDisplayComponents(t=>t.setContent(`## 🥽 VR Avatar của ${user.tag}\nJoin GES: ${INVITE_LINK}`)).addMediaGalleryComponents(g=>g.addItems(x=>x.setURL(url)));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
    if(i.commandName==="banner"){
      const url = user.bannerURL({size:1024});
      if(!url) return i.editReply("Chưa có banner");
      const panel = new ContainerBuilder().setAccentColor(0x5865F2).addTextDisplayComponents(t=>t.setContent(`**Banner của ${user.tag}**`)).addMediaGalleryComponents(g=>g.addItems(x=>x.setURL(url)));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
  });

  await client.login(token);
  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: [avatarCmd.toJSON(), bannerCmd.toJSON()] });
  return client;
}

const t1 = process.env.TOKEN || process.env.DISCORD_TOKEN;
const t2 = process.env.DISCORD_TOKEN2;
if(!t1) throw new Error("Thiếu TOKEN");
await startBot(t1, "GES-1");
if(t2) await startBot(t2, "GES-2");
console.log("GES VR Bot Ready - Join GES https://discord.gg/J4v2WDsGjP");
