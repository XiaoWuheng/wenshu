import fs from 'node:fs';
import path from 'node:path';
import {marked} from 'marked';
import sanitize from 'sanitize-html';
import mammoth from 'mammoth';
import {Document,Paragraph,TextRun,Packer,HeadingLevel} from 'docx';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function documentHtml({title,content,byline=''}){
 if(typeof title!=='string'||typeof content!=='string'||content.length>2000000)throw new Error('稿件格式或长度不正确');
 const body=sanitize(marked.parse(content),{allowedTags:['p','br','h1','h2','h3','h4','h5','h6','strong','em','del','blockquote','ul','ol','li','pre','code','table','thead','tbody','tr','th','td','hr','a'],allowedAttributes:{a:['href']},allowedSchemes:['http','https'],allowProtocolRelative:false});
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(title)}</title><style>body{max-width:780px;margin:40px auto;padding:0 28px;font:16px/1.9 system-ui;color:#28362d}h1,h2,h3{line-height:1.5}pre{white-space:pre-wrap;background:#f3f3ef;padding:14px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:7px}blockquote{border-left:3px solid #879781;padding-left:16px}a{color:#536c49}img{display:none}@media print{body{margin:0;max-width:none}h1,h2,h3{break-after:avoid}}</style><h1>${escape(title)}</h1>${byline?`<p>${escape(byline)}</p>`:''}${body}</html>`;
}
function runs(tokens=[]){return tokens.flatMap(t=>{if(t.type==='strong'||t.type==='em'||t.type==='del')return [new TextRun({text:t.text,bold:t.type==='strong',italics:t.type==='em',strike:t.type==='del'})];if(t.type==='link')return [new TextRun(t.text+' ('+t.href+')')];if(t.type==='image')return [];return [new TextRun(t.text||t.raw||'')];});}
export async function wordBuffer(payload){
 documentHtml(payload);
 const children=[new Paragraph({text:payload.title,heading:HeadingLevel.TITLE})];if(payload.byline)children.push(new Paragraph(payload.byline));
 for(const t of marked.lexer(payload.content)){if(t.type==='space')continue;if(t.type==='list'){for(const [index,item] of t.items.entries())children.push(new Paragraph({children:[...(t.ordered?[new TextRun(String((Number(t.start)||1)+index)+'. ')]:[]),...runs(marked.lexer(item.text)[0]?.tokens||[{text:item.text}])],bullet:t.ordered?undefined:{level:0},text:undefined}));}else if(t.type==='table'){children.push(new Paragraph(t.header.map(c=>c.text).join(' | ')));for(const row of t.rows)children.push(new Paragraph(row.map(c=>c.text).join(' | ')));}else if(t.type!=='html')children.push(new Paragraph({children:runs(t.tokens||[{text:t.text||''}]),heading:t.type==='heading'?HeadingLevel['HEADING_'+Math.min(t.depth,6)]:undefined}));}
 return Packer.toBuffer(new Document({sections:[{children}]}));
}
export async function extractFile(file){
 let buffer,name;if(typeof file==='string'){name=path.basename(file);if(fs.statSync(file).size>30*1024*1024)throw new Error('单个资料文件上限 30 MB');buffer=fs.readFileSync(file);}else{if(!file||typeof file.name!=='string'||!Array.isArray(file.bytes)||file.bytes.length>30*1024*1024)throw new Error('文件无效');name=path.basename(file.name);buffer=Buffer.from(file.bytes);}
 const ext=path.extname(name).toLowerCase();let text='';
 if(['.txt','.md','.csv','.srt','.vtt'].includes(ext))text=buffer.toString('utf8');
 else if(ext==='.docx')text=(await mammoth.extractRawText({buffer})).value;
 else if(ext==='.pdf'){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:false});let pdf;try{pdf=await task.promise;if(pdf.numPages>500)throw new Error('PDF 超过 500 页，请拆分');for(let page=1;page<=pdf.numPages;page++){const p=await pdf.getPage(page);const content=await p.getTextContent();text+='\n\n[第 '+page+' 页]\n'+content.items.map(x=>x.str||'').join(' ');if(text.length>2000000)throw new Error('提取文字超过 200 万字符，请拆分文件');}}finally{await task.destroy();}}
 else throw new Error('暂不支持此格式，请转成 TXT、Markdown、DOCX 或含文字的 PDF');
 if(!text.replace(/\[第 \d+ 页\]/g,'').trim())throw new Error('未提取到文字，扫描 PDF 需先做 OCR');if(text.length>2000000)throw new Error('提取文字超过 200 万字符');return {title:name,notes:text,type:'文件摘录',url:''};
}
