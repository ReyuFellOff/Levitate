export const honeypotConfig = {
  channelName: 'honeypot',
  accentColor: 0xF5B942,
  imageUrl: process.env['HONEYPOT_IMAGE_URL'] ?? 'https://cdn-icons-png.flaticon.com/512/3069/3069172.png',
  title: 'DO NOT SEND ANY MESSAGES IN THIS CHANNEL!',
  description: 'This channel catches unwanted activity. Any message sent here will result in a kick.',
};
