import "./EditPage.css";
import { useParams, useNavigate, Link } from "react-router-dom"; // Import Link
import { FaArrowLeft } from "react-icons/fa"; // Import icon cho nút bấm
import LayerPanel from "./LayerPanel";
import PropertiesPanel from "./PropertiesPanel";
import { useState, useRef, useEffect } from "react";
import Toolbox from "./Toolbox";
import WorkSpace from "./WorkSpace";
import {
  createTemplate,
  getTemplateById,
  updateTemplate,
} from "../../services/templateService";
import {
  getCardById,
  updateCard,
} from "../../services/cardService";
import { toast } from "react-toastify";

import { PanelContext } from "./PanelContext";

export default function EditPage({ viewOnly = false, editorMode = "cards" }) {
  const [textDetails, setTextDetails] = useState({
  text: "Nhập chữ ở đây",
  fill: "#000000",
  fontSize: 24,
  fontWeight: "normal",
  fontStyle: "normal",
  underline: false,
});
  const navigate = useNavigate();
  const { id } = useParams();
  const mode = editorMode;
  const [imageDetails, setImageDetails] = useState({
  url: "",
  scale: 1,
});
  const [template, setTemplate] = useState(null);
  const [cardName, setCardName] = useState("");
  const [cardDesc, setCardDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [closePanels, setClosePanels] = useState(false);
  const [layerSelected, setLayerSelected] = useState("chưa chọn");
  const [toolSelected, setToolSelected] = useState("chưa chọn");
  const [toolNum, setToolNum] = useState(6);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawBrush, setDrawBrush] = useState({ color: "blue", width: 15 });
  const [rectDetails, setRectDetails] = useState({fill: "white", stroke:"black", strokeWidth:2});
  const fabricRef = useRef(null);

  const getSizeToolBox = (toolsNum) => `w-[${toolsNum * 64}px]`;

  useEffect(() => {
    let active = true;
    if (id === "blank") {
      if (mode !== "templates") { navigate("/cards", { replace: true }); return; }
      setTemplate({ fabricEdit: null, name: "Blank Template" });
      return;
    }

    const fetchData = async () => {
      try {
        const res =
          mode === "cards" ? await getCardById(id) : await getTemplateById(id);
        
        if (!active) return;
        setTemplate(res.data);
        setCardName(res.data?.name || res.data?.cardName || "");
        setCardDesc(res.data?.cardDESC || "");
      } catch (err) {
        if (!active) return;
        console.error(err);
        toast.error(`Không thể lấy dữ liệu`);
        navigate('/cards');
      }
    };
    fetchData();
    return () => { active = false; };
  }, [id, mode, navigate]);

  if (!template) return <div>Đang tải thiệp...</div>;

  const handleSave = async (event) => {
    event.preventDefault();
    if (!cardName.trim()) { toast.error("Vui lòng nhập tên thiết kế."); return; }
    if (saving || !canvasReady || !fabricRef.current) return;
    setSaving(true);
    try {
      const fabricEdit = fabricRef.current.toJSON();
      if (mode === "templates") {
        const data = { name: cardName.trim(), fabricEdit };
        if (id === "blank") await createTemplate(data);
        else await updateTemplate(id, data);
      } else {
        await updateCard(id, { cardName: cardName.trim(), cardDESC: cardDesc, fabricEdit });
      }
      toast.success("Đã lưu thiết kế.");
      navigate(mode === "templates" ? "/templates" : "/cards");
    } catch {
      toast.error("Không thể lưu thiết kế. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative h-screen w-screen bg-gray-200">
      {/*Thêm nút quay lại ở đây */}
      {viewOnly && (
        <Link 
        to="/cards" 
        className="absolute top-4 left-4 z-50 flex items-center justify-center w-12 h-12 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
        aria-label="Back to cards"
      >
        <FaArrowLeft className="text-gray-800" />
      </Link>
      )}
    
      {/* Popup để lưu card */}
      {!viewOnly && (
        <form onSubmit={handleSave} style={{ position: "absolute", zIndex: 50, top: 12, left: "17%", right: "17%", display: "flex", flexWrap: "wrap", gap: 8, padding: 12, background: "white", borderRadius: 8 }}>
          <input aria-label="Tên thiết kế" placeholder="Tên thiết kế" value={cardName} onChange={(e) => setCardName(e.target.value)} required maxLength={200} disabled={saving} />
          {mode === "cards" && <input aria-label="Mô tả thiệp" placeholder="Mô tả thiệp" value={cardDesc} onChange={(e) => setCardDesc(e.target.value)} disabled={saving} />}
          <button type="submit" disabled={saving || !canvasReady}>{saving ? "Đang lưu..." : "Lưu thiết kế"}</button>
          <button type="button" onClick={() => navigate(mode === "templates" ? "/templates" : "/cards")} disabled={saving}>Quay lại</button>
        </form>
      )}

      <PanelContext.Provider
        value={{
          handleSave, saving, canvasReady, cardName, setCardName, fabricRef, drawBrush, setDrawBrush,
          closePanels, setClosePanels, layerSelected, setLayerSelected,
          toolSelected, setToolSelected, toolNum, setToolNum, drawingMode,
          setDrawingMode, template, id, mode,rectDetails, setRectDetails,imageDetails, setImageDetails,textDetails, setTextDetails,
        }}
      >
        <div id="canvasWorkSpace" className="absolute h-screen w-screen">
          <WorkSpace
            fabricData={template.fabricEdit}
            viewOnly={viewOnly}
            onReady={setCanvasReady}
          />
        </div>

        {/* Chỉ render các thanh công cụ nếu không ở chế độ viewOnly */}
        {!viewOnly && (
          <>
          
            <div id="layerPanel" className="h-full w-[15%]">
              <LayerPanel />
            </div>
            <div id="toolBox" className={`fixed left-1/2 -translate-x-1/2 bottom-4 h-[64px] ${getSizeToolBox(toolNum)}`}>
              <Toolbox />
            </div>
            <div id="propertiesPanel" className={`absolute right-0 top-0 h-full ${!closePanels ? "w-[15%]" : "w-0"} transition-all ease-in-out duration-700`}>
              <PropertiesPanel />
            </div>
          </>
        )}
      </PanelContext.Provider>
    </div>
  );
}

