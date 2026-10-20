import {esc} from './ba-shell.mjs';
// Render only the simple headings, paragraphs and emphasis in Turnly's template.
// Escape before formatting; document text and signer fields never become HTML.
export function agreementHtml(text){
 const inline=value=>esc(value).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
 return String(text||'').split(/\n\s*\n/).map(block=>{
  if(block.split('\n').every(line=>/^#{1,3} /.test(line)))return block.split('\n').map(line=>{const h=line.match(/^(#{1,3}) (.+)$/),level=Math.min(h[1].length+1,4);return `<h${level}>${inline(h[2])}</h${level}>`;}).join('');
  const heading=block.match(/^(#{1,3}) (.+)$/);
  if(heading)return `<h${Math.min(heading[1].length+1,4)}>${inline(heading[2])}</h${Math.min(heading[1].length+1,4)}>`;
  if(block.trim()==='---')return '<hr>';
  return `<p>${block.split('\n').map(inline).join('<br>')}</p>`;
 }).join('');
}
