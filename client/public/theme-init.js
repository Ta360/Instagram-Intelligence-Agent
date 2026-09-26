try {
  if (localStorage.getItem("iia-theme") === "light") document.documentElement.classList.remove("dark");
} catch (e) {}
