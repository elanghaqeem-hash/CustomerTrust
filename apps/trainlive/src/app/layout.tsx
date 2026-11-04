import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={
 title:'TrainLive | Customer Trust Challenge',
 description:'Kuis, polling, lembar kerja dan pembelajaran interaktif untuk peserta training.',
 robots:{index:false,follow:false}
};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="id"><body>{children}</body></html>;
}
