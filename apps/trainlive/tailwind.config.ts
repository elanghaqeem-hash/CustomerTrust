import type { Config } from 'tailwindcss';
export default {
 content: ['./src/**/*.{ts,tsx}'],
 theme: { extend: { colors: { navy:'#0C1E33',gold:'#B0801F',teal:'#0D6E6D',paper:'#FAF8F4',brick:'#A8452F' } } },
 plugins:[]
} satisfies Config;
