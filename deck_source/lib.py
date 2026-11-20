import copy
import os
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

FONT = "Google Sans Flex"
FONT_B = "Google Sans Flex SemiBold"
BLUE, RED, YEL, GRN = "1A73E8", "D93025", "F9AB00", "1E8E3E"
DARK, GREY, LINE, SURF = "202124", "5F6368", "DADCE0", "F8F9FA"
TBLUE, TRED, TYEL, TGRN = "E8F0FE", "FCE8E6", "FEF7E0", "E6F4EA"
WHITE = "FFFFFF"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(BASE_DIR, "icons") + "/"


def rgb(h):
    return RGBColor.from_string(h)


def _font(run, size, color, bold, italic=False):
    f = run.font
    f.size = Pt(size)
    f.color.rgb = rgb(color)
    f.bold = False
    f.italic = italic
    f.name = FONT_B if bold else FONT
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set("typeface", FONT_B if bold else FONT)


def text(slide, x, y, w, h, paras, size=11, color=DARK, bold=False, align="l",
         anchor="t", margin=0.04, name=None, spacing=2, bullet=False):
    """paras: list of paragraphs; each is str or list of (text, dict) runs."""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        tb.name = name
    tf = tb.text_frame
    tf.word_wrap = True
    m = Inches(margin)
    tf.margin_left = tf.margin_right = m
    tf.margin_top = tf.margin_bottom = Inches(0.02)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    if isinstance(paras, str):
        paras = [paras]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        if spacing and i > 0:
            para.space_before = Pt(spacing)
        runs = [(p, {})] if isinstance(p, str) else p
        pb = bullet
        for t, o in runs:
            if t == "__bullet__":
                pb = True
                continue
            r = para.add_run()
            r.text = t
            _font(r, o.get("size", size), o.get("color", color), o.get("bold", bold), o.get("italic", False))
        if pb:
            pPr = para._p.get_or_add_pPr()
            pPr.set("marL", str(Inches(0.14)))
            pPr.set("indent", str(-Inches(0.14)))
            bc = etree.SubElement(pPr, qn("a:buClr"))
            etree.SubElement(bc, qn("a:srgbClr")).set("val", o.get("bc", BLUE) if runs else BLUE)
            etree.SubElement(pPr, qn("a:buSzPct")).set("val", "100000")
            etree.SubElement(pPr, qn("a:buFont")).set("typeface", "Arial")
            etree.SubElement(pPr, qn("a:buChar")).set("char", "•")
    return tb


def box(slide, x, y, w, h, fill=SURF, line=None, shape="round", radius=0.08, name=None, lw=0.75, dash=False):
    st = {"round": MSO_SHAPE.ROUNDED_RECTANGLE, "rect": MSO_SHAPE.RECTANGLE, "oval": MSO_SHAPE.OVAL,
          "chev": MSO_SHAPE.CHEVRON, "pent": MSO_SHAPE.PENTAGON}[shape]
    s = slide.shapes.add_shape(st, Inches(x), Inches(y), Inches(w), Inches(h))
    if name:
        s.name = name
    if fill:
        s.fill.solid()
        s.fill.fore_color.rgb = rgb(fill)
    else:
        s.fill.background()
    if line:
        s.line.color.rgb = rgb(line)
        s.line.width = Pt(lw)
        if dash:
            from pptx.enum.dml import MSO_LINE
            s.line.dash_style = MSO_LINE.DASH
    else:
        s.line.fill.background()
    if shape == "round":
        s.adjustments[0] = min(0.5, radius / min(w, h))
    if shape in ("chev", "pent"):
        s.adjustments[0] = 0.3
    s.shadow.inherit = False
    s.text_frame.text = ""
    return s


def boxtext(s, paras, size=10, color=DARK, bold=False, align="c", anchor="m", margin=0.06):
    tf = s.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(margin)
    tf.margin_top = tf.margin_bottom = Inches(0.03)
    tf.vertical_anchor = {"t": MSO_ANCHOR.TOP, "m": MSO_ANCHOR.MIDDLE, "b": MSO_ANCHOR.BOTTOM}[anchor]
    if isinstance(paras, str):
        paras = [paras]
    for i, p in enumerate(paras):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = {"l": PP_ALIGN.LEFT, "c": PP_ALIGN.CENTER, "r": PP_ALIGN.RIGHT}[align]
        runs = [(p, {})] if isinstance(p, str) else p
        for t, o in runs:
            r = para.add_run()
            r.text = t
            _font(r, o.get("size", size), o.get("color", color), o.get("bold", bold), o.get("italic", False))
    return s


def icon(slide, name, x, y, d=0.36, bg=BLUE, fg="FFFFFF", pad=0.2):
    if bg:
        box(slide, x, y, d, d, fill=bg, shape="oval")
    p = d * pad
    pic = slide.shapes.add_picture(f"{ICON}{name}_{fg}.png", Inches(x + p), Inches(y + p), Inches(d - 2 * p), Inches(d - 2 * p))
    pic.name = f"icon {name}"
    return pic


def arrow(slide, x1, y1, x2, y2, color=GREY, w=1.25):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = rgb(color)
    c.line.width = Pt(w)
    ln = c.line._get_or_add_ln()
    te = etree.SubElement(ln, qn("a:tailEnd"))
    te.set("type", "triangle")
    te.set("w", "med")
    te.set("len", "med")
    return c
