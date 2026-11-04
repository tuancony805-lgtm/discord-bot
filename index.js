import "dotenv/config";
import fs from "fs";
import { ActivityType, Client, ContainerBuilder, GatewayIntentBits, MessageFlags, REST, Routes, SlashCommandBuilder } from "discord.js";
import { joinVoiceChannel } from "@discordjs/voice";

const PREFIX = "!";
const ownersMap = new Map();

// Đọc owner từ file
if (!fs.existsSync("./data")) fs.mkdirSync("./data");
const OWNER_FILE = "./data/owners.json";
let ownersData = {};
try { ownersData = JSON.parse(fs.readFileSync(OWNER_FILE,"utf8")); } catch {}

function saveOwners(){ fs.writeFileSync(OWNER_FILE, JSON.stringify(ownersData)); }
const MOD_CMDS = new Set(["setowner","removeowner","owners","mute","unmute","ban","unban","help"]);

class VoiceManager {
  group; connections = new Map();
  constructor(g){ this.group=g; }
  getConnection(id){ return this.connections.get(id); }
  setConnection(id,c){ this.connections.set(id,c); }
  removeConnection(id){ this.connections.delete(id); }
}

const avatarCmd = new SlashCommandBuilder().setName("avatar").setDescription("Xem avatar").addUserOption(o=>o.setName("user").setDescription("user").setRequired(false));
const bannerCmd = new SlashCommandBuilder().setName("banner").setDescription("Xem banner").addUserOption(o=>o.setName("user").setDescription("user").setRequired(false));

function leave(voice, guildId){
  const c = voice.getConnection(guildId);
  voice.removeConnection(guildId);
  if(c) try{ c.destroy(); } catch{}
}

async function startBot(token, label){
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  const voice = new VoiceManager(label);
  client.once("ready", ()=>{ console.log(`[${label}] Online ${client.user.tag}`); client.user.setPresence({ status:"online", activities:[{ name:"Built with VybeBot.ai | VYBEVIP", type: ActivityType.Watching }] }); });
  
  client.on("messageCreate", async (message)=>{
    if(message.author.bot) return;
    if(!message.guild) return;
    const content = message.content.trim();
    if(!content.startsWith(PREFIX)) return;
    const tokens = content.slice(1).split(/\s+/);
    const name = tokens[0].toLowerCase();
    const args = tokens.slice(1);

    // moderation - ông gửi tui đó
    if(MOD_CMDS.has(name)){
      if(name==="help") return message.reply("`!join !leave !setowner @user !removeowner @user !owners !mute @user 10m !unmute @user !ban @user !unban id`");
      if(name==="setowner"){ 
        const ids = message.mentions.users.map(u=>u.id);
        if(!ids.length) return message.reply("Tag người đi");
        ownersData[message.guild.id] = [...new Set([...(ownersData[message.guild.id]||[]), ...ids])];
        saveOwners(); return message.reply(`Đã set owner: ${ids.map(i=>`<@${i}>`).join(", ")}`);
      }
      if(name==="owners"){
        const list = ownersData[message.guild.id]||[];
        return message.reply(list.length ? `Owner: ${list.map(i=>`<@${i}>`).join(", ")}` : "Chưa có owner");
      }
      // mute/ban... giữ nguyên logic discord.js
      if(name==="mute"){ const user = message.mentions.members.first(); if(!user) return; await user.timeout(10*60*1000, "mute"); return message.reply(`Đã mute ${user}`); }
      if(name==="unmute"){ const user = message.mentions.members.first(); if(!user) return; await user.timeout(null); return message.reply(`Đã unmute ${user}`); }
      if(name==="ban"){ const user = message.mentions.users.first(); if(!user) return; await message.guild.bans.create(user.id); return message.reply(`Đã ban ${user.tag}`); }
      if(name==="unban"){ if(!args[0]) return; await message.guild.bans.remove(args[0]); return message.reply(`Đã unban ${args[0]}`); }
      if(name==="removeowner"){ const ids = message.mentions.users.map(u=>u.id); ownersData[message.guild.id] = (ownersData[message.guild.id]||[]).filter(x=>!ids.includes(x)); saveOwners(); return message.reply("Đã gỡ"); }
      return;
    }

    if(name==="join"){
      const vc = message.member?.voice.channel; if(!vc) return message.reply("Bạn phải vào voice trước đã Ní ơi");
      leave(voice, message.guild.id);
      const conn = joinVoiceChannel({ channelId: vc.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator, group: voice.group, selfDeaf:true, selfMute:true });
      voice.setConnection(message.guild.id, conn);
      return message.reply(`Đã vào ${vc}`);
    }
    if(name==="leave"){ leave(voice, message.guild.id); return message.reply("Đã rời voice"); }
  });

  client.on("interactionCreate", async (i)=>{
    if(!i.isChatInputCommand()) return;
    await i.deferReply();
    const targetId = i.options.getUser("user")?.id ?? i.user.id;
    const user = await client.users.fetch(targetId);
    if(i.commandName==="avatar"){
      const panel = new ContainerBuilder().setAccentColor(0x5865f2).addTextDisplayComponents(t=>t.setContent(`**Avatar của ${user.tag}**`)).addMediaGalleryComponents(g=>g.addItems(x=>x.setURL(user.displayAvatarURL({size:1024}))));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
    if(i.commandName==="banner"){
      const url = user.bannerURL({size:1024}); if(!url) return i.editReply("Chưa có banner");
      const panel = new ContainerBuilder().setAccentColor(0x5865f2).addTextDisplayComponents(t=>t.setContent(`**Banner của ${user.tag}**`)).addMediaGalleryComponents(g=>g.addItems(x=>x.setURL(url))));
      return i.editReply({ components:[panel], flags: MessageFlags.IsComponentsV2 });
    }
  });

  await client.login(token);
  const rest = new REST().setToken(token);
  await rest.put(Routes.applicationCommands(client.user.id), { body: [avatarCmd.toJSON(), bannerCmd.toJSON()] });
  return client;
}

const t1 = process.env.DISCORD_TOKEN;
const t2 = process.env.DISCORD_TOKEN2;
if(!t1) throw new Error("Thiếu DISCORD_TOKEN");
await startBot(t1, "emuk");
if(t2) await startBot(t2, "Văn Phát");
console.log("Cả 2 bot chạy rồi");