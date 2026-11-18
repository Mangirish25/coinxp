export const themeTokens = {
  default: { canvas:'#f5f7f6',surface:'#ffffff',brand50:'#eef8f6',brand100:'#d5eeea',brand500:'#258f82',brand600:'#1b746a',brand700:'#165d56',ink900:'#142421',ink700:'#3e514d',ink500:'#596762' },
  theme_midnight: { canvas:'#101827',surface:'#172234',brand50:'#23344b',brand100:'#344a65',brand500:'#38bdf8',brand600:'#0ea5e9',brand700:'#7dd3fc',ink900:'#ecf2ff',ink700:'#ced9e8',ink500:'#a9bad0' },
  theme_forest: { canvas:'#edf4ee',surface:'#ffffff',brand50:'#e4f1e7',brand100:'#c5e1cb',brand500:'#2f8550',brand600:'#20713f',brand700:'#165a32',ink900:'#172c20',ink700:'#365440',ink500:'#49614f' },
  theme_sunrise: { canvas:'#fff7ed',surface:'#fffdf9',brand50:'#ffedd5',brand100:'#fed7aa',brand500:'#c2410c',brand600:'#9a3412',brand700:'#7c2d12',ink900:'#332216',ink700:'#5d422d',ink500:'#73563d' },
} as const;
export type ThemeKey = keyof typeof themeTokens;
export function contrastRatio(foreground:string,background:string) {
  const luminance=(color:string)=>{
    const rgb=color.slice(1).match(/.{2}/g)!.map((channel)=>parseInt(channel,16)/255).map((value)=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2);
    return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
  };
  const a=luminance(foreground);const b=luminance(background);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
