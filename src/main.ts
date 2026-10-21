import "./styles.css";
import { mount } from "./app";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app");
mount(root);
