import {App, GenericMessageEvent, LogLevel} from '@slack/bolt';
import {
  Channel,
  Client,
  GuildChannel,
  Intents,
  Message,
  MessageOptions as DiscordMessageOptions,
  TextChannel,
  Webhook,
} from 'discord.js';

// region API Clients
const slackClient = new App({
  token: process.env.SLACK_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  //   logLevel: LogLevel.DEBUG,
  port: process.env.SLACK_PORT ? +process.env.SLACK_PORT : 3000,
});
const discordClient = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS],
});
// endregion

const discordChannelId = process.env.DISCORD_CHANNEL_ID as string;
const slackChannelName = process.env.SLACK_CHANNEL_NAME as string;

let discordWebhook: Webhook;
let discordChannel: Channel;

interface SlackProfile {
  username: string;
  avatar_url: string;
}
const slackProfileCache: Record<string, SlackProfile> = {};

async function fetchSlackProfile(userId: string): Promise<SlackProfile> {
  if (userId in slackProfileCache) {
    return slackProfileCache[userId];
  } else {
    const fetchedProfile = await slackClient.client.users.profile.get({user: userId});
    slackProfileCache[userId] = {
      username: fetchedProfile.profile.display_name_normalized || fetchedProfile.profile.real_name_normalized,
      avatar_url: fetchedProfile.profile.image_192,
    };
    return slackProfileCache[userId];
  }
}

async function cleanSlackMessages(message: GenericMessageEvent): Promise<string> {
  const emoji = /:(.*?):/g.exec(message.text);
  const emojiManager = (discordChannel as GuildChannel).guild.emojis;
  let currentText = message!.text;
  if (emoji) {
    for (const e of emoji.slice(1)) {
      let emojiObj = emojiManager.cache.find(x => x.name === e);
      if (!emojiObj) {
        emojiObj = (await emojiManager.fetch()).find(x => x.name === e);
      }
      if (emojiObj) {
        currentText = currentText.replace(new RegExp(`:${e}:`), emojiObj.toString());
      }
    }
  }
  return currentText;
}

discordClient.on('ready', async () => {
  console.log(`Logged it to discord as ${discordClient.user?.tag}`);
  discordChannel = await discordClient.channels.fetch(discordChannelId);
  discordClient.user.setPresence({activities: [{name: 'linking friends across ecosystems'}]});
  if (!(discordChannel instanceof TextChannel)) {
    console.error(`Discord channel ${discordChannelId} is not a text channel, unable to continue`);
    process.exit();
  }
  const currentWebhooks = await discordChannel.fetchWebhooks();
  discordWebhook = currentWebhooks.find(x => x.owner.id === discordClient.user.id);
  if (!discordWebhook) {
    console.log('Webhook not found, creating one now...');
    discordWebhook = await discordChannel.createWebhook('Coffee Break Sync');
  }
  console.log(`Webhook with id ${discordWebhook.id} and first part of token ${discordWebhook.token.substr(0, 10)}`);
});

discordClient.on('messageCreate', async message => {
  if (
    message.channelId == discordChannelId &&
    (message.member ?? message.author).id != message.webhookId &&
    !message.author.bot
  ) {
    const displayName = message.member?.nickname ? message.member?.nickname : message.author.username;
    // console.log(`displayName: ${displayName}`, 'discord');
    let avatarURL = message.author.avatarURL({format: 'png'});
    // console.log(`avatarURL: ${avatarURL}`, 'discord');

    const evenCleanerContent = message.cleanContent.replace(/<a?(:.*?:)\d+>/g, '$1');

    slackClient.client.chat.postMessage({
      channel: slackChannelName,
      text: evenCleanerContent,
      // These two require the OAuth scope `chat:write.customize`
      username: displayName + ' (Discord)',
      icon_url: avatarURL as string | undefined,
    });
  }
});

slackClient.message(async ({message}) => {
  const typedMessage = message as GenericMessageEvent;
  if (!typedMessage.bot_id) {
    const cleanedText = await cleanSlackMessages(typedMessage);
    const slackProfile = await fetchSlackProfile(typedMessage.user);
    discordWebhook.send({
      username: slackProfile.username + ' (Slack)',
      avatarURL: slackProfile.avatar_url,
      content: cleanedText,
    });
  }
});

(async () => {
  await slackClient.start();
  console.log('Slack client started with socket mode');
  discordClient.login(process.env.DISCORD_BOT_TOKEN);
  console.log('Discord client started');
})();

process.on('SIGINT', async () => {
  console.log('\nCleaning up API clients');
  await discordClient.user.setPresence({status: 'invisible'});
  slackClient.stop();
  process.exit();
});
