import os
import shutil
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'output','pdf')
PRIVATE=os.path.join(ROOT,'private-storage','reports')
os.makedirs(OUT,exist_ok=True)
os.makedirs(PRIVATE,exist_ok=True)
BLUE=colors.HexColor('#17324D'); PRIMARY=colors.HexColor('#2F5D8A'); STEEL=colors.HexColor('#6F8FAF'); PALE=colors.HexColor('#EAF1F7'); MUTED=colors.HexColor('#6B7C8C'); GREEN=colors.HexColor('#4F7D67')
DATA={'month':('Deze maand',13350,5180,8170,23510,5082,223,713,2043),'quarter':('Dit kwartaal',36750,12730,24020,23510,5082,223,2140,6005),'ytd':('Boekjaar tot nu',98250,31780,66470,23510,5082,223,6420,16618)}

def euro(v): return f"EUR {v:,.0f}".replace(',','.')
def header_footer(c,doc):
    c.saveState(); c.setFillColor(BLUE); c.rect(0,A4[1]-24*mm,A4[0],24*mm,fill=1,stroke=0)
    logo=os.path.join(ROOT,'public','assets','logo.png')
    if os.path.exists(logo): c.drawImage(logo,18*mm,A4[1]-19*mm,width=46*mm,height=13.8*mm,mask='auto',preserveAspectRatio=True)
    c.setFillColor(MUTED); c.setFont('Helvetica',8); c.drawString(18*mm,12*mm,'Destination Known Administraties - vertrouwelijke klantrapportage'); c.drawRightString(A4[0]-18*mm,12*mm,f'Pagina {doc.page}'); c.restoreState()
def chart(c,x,y,w,h,revenue,costs):
    labels=['apr','mei','jun','jul','aug','sep']; weights=[.76,.86,.91,.88,.96,1.04]; maxv=max(revenue/9*max(weights),costs/9*1.05)
    c.setStrokeColor(colors.HexColor('#DCE6EF')); c.line(x,y,x+w,y)
    group=w/len(labels)
    for i,(label,weight) in enumerate(zip(labels,weights)):
        rv=revenue/9*weight; cv=costs/9*(.92+i*.02); bx=x+i*group+5
        c.setFillColor(PRIMARY); c.rect(bx,y,group*.28,h*rv/maxv,fill=1,stroke=0)
        c.setFillColor(STEEL); c.rect(bx+group*.31,y,group*.28,h*cv/maxv,fill=1,stroke=0)
        c.setFillColor(MUTED); c.setFont('Helvetica',7); c.drawCentredString(bx+group*.29,y-4*mm,label)
def build(period):
    label,revenue,costs,result,bank,sales,purchases,vat,tax=DATA[period]
    path=os.path.join(OUT,f'de-boer-advies-{period}.pdf')
    doc=SimpleDocTemplate(path,pagesize=A4,rightMargin=18*mm,leftMargin=18*mm,topMargin=34*mm,bottomMargin=22*mm)
    styles=getSampleStyleSheet(); styles.add(ParagraphStyle(name='TitleBlue',parent=styles['Title'],fontName='Helvetica-Bold',fontSize=22,leading=27,textColor=BLUE,spaceAfter=5*mm)); styles.add(ParagraphStyle(name='BodyDK',parent=styles['BodyText'],fontSize=10,leading=15,textColor=colors.HexColor('#20364A'))); styles.add(ParagraphStyle(name='SmallDK',parent=styles['BodyText'],fontSize=8.5,leading=12,textColor=MUTED))
    story=[Paragraph('Financieel overzicht',styles['TitleBlue']),Paragraph(f'De Boer Advies | {label} | Gegenereerd 21 september 2026',styles['SmallDK']),Spacer(1,7*mm)]
    metrics=[['Omzet','Kosten','Resultaat vóór belasting'],[euro(revenue),euro(costs),euro(result)]]
    table=Table(metrics,colWidths=[55*mm]*3,rowHeights=[9*mm,15*mm]);table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('TEXTCOLOR',(0,0),(-1,0),MUTED),('TEXTCOLOR',(0,1),(-1,1),BLUE),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,1),(-1,1),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,0),8),('FONTSIZE',(0,1),(-1,1),16),('ALIGN',(0,0),(-1,-1),'LEFT'),('BOX',(0,0),(-1,-1),.5,colors.HexColor('#DCE6EF')),('INNERGRID',(0,0),(-1,-1),.5,colors.HexColor('#DCE6EF')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),4*mm)]));story += [table,Spacer(1,7*mm),Paragraph(f'Uw omzet bedraagt {euro(revenue)} in {label.lower()}. Na aftrek van {euro(costs)} aan geregistreerde kosten resteert een voorlopig resultaat vóór belasting van {euro(result)}.',styles['BodyDK']),Spacer(1,5*mm)]
    secondary=[['Banksaldo',euro(bank)],['Openstaande verkoopfacturen',euro(sales)],['Openstaande inkoopfacturen',euro(purchases)],['Verwachte BTW',euro(vat)],['Belastingreservering',euro(tax)]]
    st=Table(secondary,colWidths=[90*mm,75*mm]);st.setStyle(TableStyle([('ROWBACKGROUNDS',(0,0),(-1,-1),[colors.white,colors.HexColor('#F5F8FB')]),('TEXTCOLOR',(0,0),(0,-1),MUTED),('TEXTCOLOR',(1,0),(1,-1),BLUE),('FONTNAME',(1,0),(1,-1),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),3*mm),('TOPPADDING',(0,0),(-1,-1),3*mm)]));story += [st,Spacer(1,8*mm),Paragraph('Financiële ontwikkeling',styles['Heading2']),Spacer(1,58*mm)]
    def on_page(c,d):
        header_footer(c,d); chart(c,22*mm,58*mm,160*mm,31*mm,revenue,costs)
        c.setFillColor(colors.HexColor('#FBF7EF'));c.roundRect(20*mm,27*mm,170*mm,17*mm,2*mm,fill=1,stroke=0)
        c.setFillColor(colors.HexColor('#806B45'));c.setFont('Helvetica-Bold',8);c.drawString(24*mm,37*mm,'Voorlopige cijfers')
        c.setFillColor(MUTED);c.setFont('Helvetica',7.5);c.drawString(24*mm,32.5*mm,'Eén banktransactie is nog niet volledig verwerkt en één document ontbreekt. De cijfers kunnen daardoor nog wijzigen.')
    doc.build(story,onFirstPage=on_page,onLaterPages=header_footer)
    shutil.copy2(path,os.path.join(PRIVATE,os.path.basename(path)))
    print(path)
for key in DATA: build(key)
