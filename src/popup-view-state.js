(function () {
  const DOM = globalThis.ArborPopupDOM;
  const { refs, state, viewMap, panelMap, tabButtons } = DOM;

  function setActiveTab(tab, force = false) {
    if (!tab || (!panelMap[tab] && !force) || (state.activeTab === tab && !force)) {
      return;
    }

    const pageStage = refs.pageStage;
    const isVisible = Boolean(pageStage && pageStage.offsetParent !== null);
    const currentHeight = isVisible ? pageStage.getBoundingClientRect().height : 0;

    if (isVisible) {
      pageStage.style.height = `${currentHeight}px`;
    }

    state.activeTab = tab;

    Object.entries(panelMap).forEach(([name, panel]) => {
      const isActive = name === tab;
      panel.classList.remove("hidden");
      panel.classList.toggle("is-active", isActive);
    });

    Object.entries(tabButtons).forEach(([name, button]) => {
      const isActive = name === tab;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-current", isActive ? "page" : "false");
    });

    if (!isVisible) {
      if (pageStage) {
        pageStage.style.height = "";
      }
      return;
    }

    pageStage.style.height = "auto";
    const newHeight = pageStage.getBoundingClientRect().height;
    if (currentHeight === newHeight) {
      pageStage.style.height = "";
      return;
    }

    pageStage.style.height = `${currentHeight}px`;
    pageStage.offsetHeight;
    pageStage.style.height = `${newHeight}px`;

    const clearHeight = () => {
      pageStage.style.height = "";
      pageStage.removeEventListener("transitionend", onTransitionEnd);
    };
    const onTransitionEnd = (event) => {
      if (event.propertyName === "height") {
        clearHeight();
      }
    };

    pageStage.addEventListener("transitionend", onTransitionEnd);
    setTimeout(clearHeight, 400);
  }

  function setActiveView(view) {
    state.activeView = view;

    Object.entries(viewMap).forEach(([name, node]) => {
      const isActive = name === view;
      node.classList.remove("hidden");
      node.classList.toggle("is-active", isActive);
    });

    refs.bottomNav.classList.toggle("hidden", view !== "main");
  }

  globalThis.ArborPopupViewState = Object.freeze({
    setActiveTab,
    setActiveView
  });
})();
