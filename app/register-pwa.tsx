"use client";
import { useEffect } from "react";
export default function RegisterPwa(){useEffect(()=>{if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js")},[]);return null}
