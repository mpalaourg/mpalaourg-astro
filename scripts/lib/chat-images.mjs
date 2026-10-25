import {parse} from 'parse5';
export function htmlImages(html,safeImage){
  const images=[];const seen=new Set();
  const walk=(node,main=false)=>{
    const attrs=Object.fromEntries((node.attrs||[]).map(a=>[a.name,a.value]));
    if(['nav','script','style','button','form','noscript'].includes(node.tagName)||'hidden'in attrs||attrs['aria-hidden']==='true'||'data-playful-signals'in attrs||/(?:nasa-widget|f1-race-preview|f1-race-widget|fact-widget|music-widget|quote-widget|joke-widget)/.test(attrs.class||''))return;
    if(node.tagName==='main')main=true;
    if(main&&node.tagName==='img'){
      const url=safeImage(attrs.src||''),alt=(attrs.alt||'').trim().replace(/\s+/gu,' ').slice(0,300);
      if(url&&alt&&!seen.has(url)){
        seen.add(url);const dimension=n=>/^\d+$/.test(n||'')&&Number(n)>0&&Number(n)<=20000;
        images.push({url,alt,...(dimension(attrs.width)?{width:Number(attrs.width)}:{}),...(dimension(attrs.height)?{height:Number(attrs.height)}:{})});
      }
    }
    for(const child of node.childNodes||[])walk(child,main);
  };walk(parse(html));return images.slice(0,30);
}
