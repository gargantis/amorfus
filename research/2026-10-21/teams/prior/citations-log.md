# Citation verification log (team prior)

Each entry: citation as verified, the URL(s) that confirmed it, and what was
confirmed. "UNVERIFIED" marks anything that could not be confirmed online.

1. Taylor, J. E. (1976). The structure of singularities in soap-bubble-like and
   soap-film-like minimal surfaces. Annals of Mathematics 103(3), 489-539.
   MR0428181. Confirmed: https://sites.math.rutgers.edu/~jet1/pubs2015.pdf
   (author's publication list), https://archive.lib.msu.edu/crcmath/math/math/p/p352.htm.
   Content (secondary): films meet in threes at 120 deg along curves; curves meet
   in fours at the tetrahedral angle ~109.47 deg; nothing else is stable.
2. Hutchings, M., Morgan, F., Ritore, M., Ros, A. (2002). Proof of the double
   bubble conjecture. Annals of Mathematics 155(2), 459-489. doi:10.2307/3062123;
   arXiv math/0406017. Confirmed: https://arxiv.org/abs/math/0406017,
   https://math.berkeley.edu/~hutching/pub/bubble/bubble.pdf. Equal-volume case
   earlier: Hass, Hutchings, Schlafly 1995 (computer-assisted).
3. Milman, E., Neeman, J. The structure of isoperimetric bubbles on R^n and S^n.
   arXiv:2205.09102 (2022); Acta Mathematica 234(1), 71-188 (2025). Proves the
   standard triple bubble is the unique minimizer in R^n and S^n for n >= 3
   (so R^3), quadruple for n >= 4. Confirmed: https://arxiv.org/abs/2205.09102v2,
   https://amathr.org/milman-and-neeman/. Follow-up: Plateau bubbles and the
   quintuple bubble theorem on S^n, arXiv:2307.08164 (2023).
4. Wichiramala, W. (2004). Proof of the planar triple bubble conjecture.
   J. Reine Angew. Math. 567, 1-49. Confirmed (secondary listings):
   https://www.math.sc.chula.ac.th/?p=12527, Milman talk slides
   https://indico.cs.dm.unipi.it/event/14/contributions/237/attachments/66/82/Milman.pdf;
   PhD thesis UIUC 2002 (mathgenealogy id 67366).
5. Merriman, B., Bence, J. K., Osher, S. (1992). Diffusion generated motion by
   mean curvature. UCLA CAM Report 92-18. Confirmed via the bibliography of
   Swartz & Yip, arXiv:1703.06519 (ref [28]). The proceedings version (Computational
   Crystal Growers Workshop, ed. J. Taylor, AMS 1992) is commonly cited but
   UNVERIFIED here.
6. Merriman, B., Bence, J. K., Osher, S. J. (1994). Motion of multiple junctions:
   a level set approach. J. Comput. Phys. 112(2), 334-363. doi:10.1006/jcph.1994.1105.
   Confirmed (DOI and title): https://www.academia.edu/9325402/ ; page range from
   memory, consistent with listings.
7. Esedoglu, S., Otto, F. (2015). Threshold dynamics for networks with arbitrary
   surface tensions. Comm. Pure Appl. Math. 68(5), 808-864. doi:10.1002/cpa.21527.
   Confirmed: https://deepblue.lib.umich.edu/items/15c73fae-debf-4cdf-9d96-78defd4c1179 ;
   text read from MPI MiS preprint 2/2013
   (https://files-www.mis.mpg.de/mpi-typo3/preprints/2013/preprint2013_2.pdf):
   - triangle inequality on sigma is necessary and sufficient for well-posedness;
   - Proposition 1: if sigma is conditionally negative semi-definite (sum s_ij x_i x_j <= 0
     whenever sum x_i = 0; equivalently sigma_ij = |p_i - p_j|^2 for points p_i),
     each step dissipates the energy (unconditional gradient stability);
   - any triangle-inequality sigma with N <= 4 phases is conditionally NSD;
   - MBO'92 is "convolution with a positive, unit mass, radially symmetric kernel"
     then threshold; "M log M cost per time step" on a uniform grid; signed-distance
     variants are "more accurate on uniform grids".
8. Swartz, D., Yip, N. K. (2017). Convergence of diffusion generated motion to
   motion by mean curvature. arXiv:1703.06519 (Comm. PDE 2017). Read: proof uses
   only weak integrability of the kernel, not positivity.
9. Jacobs, M., Merkurjev, E., Esedoglu, S. (2018). Auction dynamics: a volume
   constrained MBO scheme. J. Comput. Phys. 354, 288-310. Confirmed:
   https://www.math.purdue.edu/~jacob225/auction_dynamics.html ; text read from
   https://web.math.ucsb.edu/~majaco/papers/auction_revised.pdf (preprint 2017-10-22):
   - volume step = assignment problem; per-phase "membership prices" = dual variables
     (the engine's lambda); constraints imposed exactly each step;
   - "sub-pixel accurate representation" trick: interpolate the smooth psi - p to
     estimate the fraction of each grid cell per phase (sec. 4);
   - temperature (sec. 3.4): perturb coefficients a_i(x) by independent N(0, T) samples
     before assignment; "temperature can help the algorithm escape from local minima";
   - random Voronoi start in 2D: "all of quadruple junctions in the initial
     configurations split and form triple junctions"; 3D "randomly shifted cubic
     lattice with 8 phases" ends in a non-optimal 12-faced polytope local minimum
     without temperature, Weaire-Phelan with temperature (Fig. 7, 8).
10. Esedoglu, S., Ruuth, S., Tsai, R. Diffusion generated motion using signed distance
   functions. Preprint dated 2009-09-09 read at
   https://websites.umich.edu/~esedoglu//Papers_Preprints/esedoglu_ruuth_tsai_2009.pdf .
   Quote: "unless grid size is refined concurrently with the time step size, the
   approximate motion generated by the algorithm gets 'stuck' [25]" with [25] = MBO 1994;
   binary functions cannot locate the interface better than dx; fixes: Ruuth's
   unequally spaced FFT / adaptive grids [31], or signed distance redistancing.
   Journal venue: see entry 12.
11. Ruuth, S. J. (1998). Efficient algorithms for diffusion-generated motion by mean
   curvature. J. Comput. Phys. 144, 603-625. And Ruuth, S. J. (1998). A diffusion
   generated approach to multiphase motion. J. Comput. Phys. 145, 166-192.
   Confirmed from two independent bibliographies (ERT preprint ref [31]; auction
   dynamics refs [40], [41]); not read directly.
12. Misiats, O., Yip, N. K. (2016). Convergence of space-time discrete threshold
   dynamics to anisotropic motion by mean curvature. Discrete Contin. Dyn. Syst. 36(11),
   6379-6411; arXiv:1411.0301. Abstract read: with dx = h and dt = tau, h << tau gives
   isotropic MCF; h = O(tau) gives pinning/de-pinning and anisotropic velocity;
   h >> tau gives no motion (complete pinning). 1D interfaces (curves).
13. Esedoglu, Ruuth, Tsai (2010), J. Comput. Phys. 229(4), 1017-1042 - venue confirmed
   from the author's publication page https://websites.umich.edu/~esedoglu/papers.htm
   (via search listing). Follow-up: Kublik, C., Esedoglu, S., Fessler, J. A. (2011).
   Algorithms for area preserving flows. SIAM J. Sci. Comput. 33(5) - listed at
   https://web.eecs.umich.edu/~fessler/papers/lists/files/jour/11/web/kublik-11-afa.pdf
   (not read; volume/issue from memory, UNVERIFIED).
14. Ilmanen, T., Neves, A., Schulze, F. (2019). On short time existence for the planar
   network flow. J. Differential Geom. 111(1), 39-89. doi:10.4310/jdg/1547607687;
   arXiv:1407.4756. Read (intro, via ar5iv): starting from a non-regular network,
   "out of non-regular initial multiple points new segments are created"; a regular
   network has three ends meeting at 2pi/3 at each multiple point. The paper does NOT
   state non-uniqueness for a quadruple point in the part read (first 100k chars);
   do not cite it for non-uniqueness.
15. Brakke, K. A. (1992). The Surface Evolver. Experimental Mathematics 1(2), 141-165.
   Confirmed: https://projecteuclid.org/euclid.em/1048709050 . Manual read at
   https://kenbrakke.com/evolver/html/single.htm and commands.htm:
   - 'O' pops non-minimal edges: "Scans for edges with more than three facets
     attached. Splits such edges into triple-facet edges." "meant for surfaces that
     have equal tension on all facets."
   - 'o' pops vertices that "don't have the topologies of one of the three minimal
     tangent cones that are legal in soap films (plane, triple edge, tetrahedral point)".
   - 'pop': vertex popped if more than four triple edges meet, edge if more than three
     facets; "Normally, popping puts in new edges and facets to keep originally
     separated regions separate."
   - 't1_edgeswap': "Does a T1 topological transition in the string model" on an edge
     joining two triple points. 'pop_edge_to_tri', 'pop_tri_to_edge', 'pop_quad_to_quad'
     are the 3D analogues.
16. Da, F., Batty, C., Grinspun, E. (2014). Multimaterial mesh-based surface tracking.
   ACM Trans. Graph. 33(4), Article 112 (SIGGRAPH 2014). doi:10.1145/2601097.2601146.
   Confirmed: https://www.cs.columbia.edu/cg/multitracker ,
   https://history.siggraph.org/?p=103592 . Abstract names T1 and T2 processes among its
   label-aware non-manifold operations; earlier arXiv version "Multimaterial Front
   Tracking" arXiv:1306.3113 (withdrawn) says it removes the need for Evolver's
   "edge popping" (secondary report via search).
17. Busaryev, O., Dey, T. K., Wang, H., Ren, Z. (2012). Animating bubble interactions in
   a liquid foam. ACM Trans. Graph. 31(4), Article 63 (SIGGRAPH 2012). Confirmed:
   https://history.siggraph.org/?p=110542 . Bubble particles are sites of a weighted
   Voronoi (power) diagram that approximates foam geometry; handles Plateau's laws,
   clusters, coalescence (abstract via search; full text not read).
18. Da, F., Batty, C., Wojtan, C., Grinspun, E. (2015). Double bubbles sans toil and
   trouble: discrete circulation-preserving vortex sheets for soap films and foams.
   ACM Trans. Graph. 34(4), Article 149 (SIGGRAPH 2015). Confirmed:
   https://www.cs.columbia.edu/cg/doublebubbles ,
   https://visualcomputing.ist.ac.at/publications/2015/DBSTaT/ . NOTE: the task text
   says "Da et al. 2016"; the paper is 2015. Follow-up: Heiss-Synak et al. (2024),
   Multi-material mesh-based surface tracking with implicit topology changes, ACM TOG
   (secondary listing; not read).
19. Saye, R. I., Sethian, J. A. (2011). The Voronoi implicit interface method for
   computing multiphase physics. PNAS 108(49), 19498-19503. doi:10.1073/pnas.1111557108.
   Confirmed: https://pmc.ncbi.nlm.nih.gov/articles/PMC3241776 . One unsigned distance
   function + indicator; Voronoi reconstruction; "automatically handles multiple
   junctions, triple points, and quadruple points in two dimensions" (search summary).
   Longer: Saye & Sethian (2012) J. Comput. Phys. 231, 6051-6085.
20. Losasso, F., Shinar, T., Selle, A., Fedkiw, R. (2006). Multiple interacting liquids.
   ACM Trans. Graph. 25(3), 812-819. doi:10.1145/1141911.1141960. Confirmed via
   api.crossref.org. One particle level set per region + projection to remove
   overlaps/vacuum.
21. Zhao, H.-K., Chan, T., Merriman, B., Osher, S. (1996). A variational level set
   approach to multiphase motion. J. Comput. Phys. 127(1), 179-195.
   doi:10.1006/jcph.1996.0167. Confirmed (search; Duke scholars listing).
22. Garcke, H., Nestler, B., Stoth, B. (1999). A multiphase field concept: numerical
   simulations of moving phase boundaries and multiple junctions. SIAM J. Appl. Math.
   60(1), 295-315. doi:10.1137/S0036139998334895. Confirmed via api.crossref.org.
23. Wu, Z., Sullivan, J. M. Jr. (2003). Multiple material marching cubes algorithm.
   Int. J. Numer. Methods Eng. 58(2), 189-207. doi:10.1002/nme.775. Confirmed via
   api.crossref.org.
24. Hege, H.-C., Seebass, M., Stalling, D., Zoeckler, M. (1997). A generalized marching
   cubes algorithm based on non-binary classifications. ZIB preprint SC-97-05.
   Confirmed: https://opus4.kobv.de/opus4-zib/frontdoor/index/index/docId/274 .
25. Frisken, S. F. (2022). SurfaceNets for multi-label segmentations with preservation
   of sharp boundaries. Journal of Computer Graphics Techniques 11(1). Confirmed:
   https://pmc.ncbi.nlm.nih.gov/articles/PMC9623606/ . Read: one vertex per cell whose
   8 corners are not all one material; "cell vertices can be associated with up to 8
   materials"; each quad separates exactly two materials; faces classed Solid /
   Surface / Junction (a JunctionFace is crossed by more than two materials, "or by two
   materials arranged diagonally"); EdgeVertices average only over JunctionFace
   neighbours "to move along the edge"; AllowedRange keeps vertices within a distance
   of the cell centre or inside the cell. No pattern lookup table.
26. Gibson, S. F. F. (1998). Constrained elastic surface nets: generating smooth
   surfaces from binary segmented data. MICCAI'98, LNCS 1496, 888-898. Confirmed
   (pages via patent citations; MERL TR99-24 is the later report):
   https://www.merl.com/publications/TR99-24 .
27. Bloomenthal, J., Ferguson, K. (1995). Polygonization of non-manifold implicit
   surfaces. SIGGRAPH '95, 309-316. doi:10.1145/218380.218462. Confirmed via
   api.crossref.org.
28. Blinn, J. F. (1982). A generalization of algebraic surface drawing. ACM Trans.
   Graph. 1(3), 235-256. doi:10.1145/357306.357310. Confirmed:
   https://resolver.caltech.edu/CaltechAUTHORS:20160615-113545697 ; sums of Gaussian
   densities ("blobby molecules").
29. Bloomenthal, J., Shoemake, K. (1991). Convolution surfaces. SIGGRAPH '91 (Computer
   Graphics 25(4)), 251-256. Confirmed: https://history.siggraph.org/?p=120593 (pages via
   DBLP listing; the 25(4) issue number not confirmed). Skeleton (polygons/curves)
   convolved with a 3D Gaussian; convolution of a union = sum of convolutions, so no
   bulge at joins.
30. Wyvill, G., McPheeters, C., Wyvill, B. (1986). Data structure for soft objects. The
   Visual Computer 2(4), 227-234. doi:10.1007/BF01900346. Confirmed:
   https://link.springer.com/doi/10.1007/BF01900346 . Soft objects use a cubic polynomial
   blending function (per Kacic-Alesic & Wyvill 1991, below).
31. Kacic-Alesic, Z., Wyvill, B. (1991). Controlled blending of procedural implicit
   surfaces. Graphics Interface '91, 236-245. Read:
   https://graphicsinterface.org/wp-content/uploads/gi1991-31.pdf . Quotes: each skeleton
   "should have a limited radius of influence R ... This enables considerable
   computational savings because implicit functions of distant skeletons need not be
   evaluated"; "Selective Blending ... group skeletons of objects which should not blend
   together [Beier 90]" ... "Surfaces that should not blend together can use 'hard'
   blending functions". (The task's "Guy & Wyvill 1995 blending graph" could NOT be
   confirmed; not cited.)
32. Gourmel, O., Barthe, L., Cani, M.-P., Wyvill, B., Bernhardt, A., Paulin, M.,
   Grasberger, H. (2013). A gradient-based implicit blend. ACM Trans. Graph. 32(2),
   Article 12. doi:10.1145/2451236.2451238. Confirmed: https://history.siggraph.org/?p=109443 .
   Targets unwanted blending at a distance and bulging.
33. Mullins, W. W. (1957). Theory of thermal grooving. J. Appl. Phys. 28(3), 333-339.
   doi:10.1063/1.1722742. Confirmed via api.crossref.org. Groove root angle fixed by the
   balance of grain-boundary and surface tensions (gamma_b / gamma_s), per secondary
   sources (Suo lecture notes, imechanica.org L07 GB Grooving).
34. von Neumann, J. (1952). Discussion, in Metal Interfaces (ASM, Cleveland), 108-110.
   UNVERIFIED as a primary source; the law (2D cell area rate proportional to n - 6) is
   confirmed via MacPherson & Srolovitz (2007), The von Neumann relation generalized to
   coarsening of three-dimensional microstructures, Nature 446, 1053-1055,
   doi:10.1038/nature05745 (https://www.nature.com/articles/nature05745). Mullins, W. W.
   (1956). Two-dimensional motion of idealized grain boundaries. J. Appl. Phys. 27,
   900-904 (confirmed from the ERT preprint bibliography, ref [26]).
35. Weaire, D., Hutzler, S. (1999). The Physics of Foams. Oxford: Clarendon Press.
   ISBN 9780198510970. Confirmed (catalogue listings, Physics Today review); contents
   include Plateau's rules and "Topological changes" (sec. 3.4). Not read.
36. Chan, T. F., Esedoglu, S. (2005). Aspects of total variation regularized L1 function
   approximation. SIAM J. Appl. Math. 65(5), 1817-1837. Read (UCLA CAM 04-07 preprint,
   https://ww3.math.ucla.edu/camreport/cam04-07.pdf): level sets solve
   min Per(Sigma) + lambda |Sigma (sym. diff.) Omega|; for f = indicator of a disk of
   radius r the minimizer is 0 for lambda < 2/r and the disk itself for lambda > 2/r
   (unique except at lambda = 2/r); contrast invariant.
37. Nielson, G. M., Hamann, B. (1991). The asymptotic decider: resolving the ambiguity
   in marching cubes. Proc. IEEE Visualization '91, 83-91. doi:10.1109/visual.1991.175782.
   Confirmed: https://en.wikipedia.org/wiki/Asymptotic_decider , escholarship.org/uc/item/17p025zk.
38. Latecki, L. J., Eckhardt, U., Rosenfeld, A. (1995). Well-composed sets. Computer
   Vision and Image Understanding 61(1), 70-83. Confirmed (DBLP listing; abstract via
   search): in well-composed sets 4- and 8-connectedness coincide.
39. Kong, T. Y., Rosenfeld, A. (1989). Digital topology: introduction and survey.
   CVGIP 48(3), 357-393. Confirmed (visionbib listing). The (8,4)/(4,8) pairing is
   standard digital topology; not confirmed from this paper's text.
40. Lengyel, E. (2010). Voxel-Based Terrain for Real-Time Virtual Simulations. PhD
   dissertation, University of California, Davis. Confirmed: https://transvoxel.org/ :
   512 transition-cell cases fall into 73 equivalence classes.
41. Lorensen, W. E., Cline, H. E. (1987). Marching cubes: a high resolution 3D surface
   construction algorithm. Computer Graphics (SIGGRAPH '87) 21(4), 163-169. Confirmed:
   https://alecjacobson.com/seminar/lorenson-and-cline-1987.pdf listing; 256-case table.
   The "15 cases by symmetry" figure is standard but not confirmed from the paper text here.
42. Esedoglu, S., Jacobs, M., Zhang, P. (2017). Kernels with prescribed surface tension
   & mobility for threshold dynamics schemes. J. Comput. Phys. (vol. 337, 62-83 from
   memory; UNVERIFIED volume/pages). Preprint: https://web.math.ucsb.edu/~majaco/papers/esedoglu_jacobs_zhang.pdf .
   Constructs kernels with a desired anisotropic surface tension and mobility; conditions
   for kernel positivity. Related: Elsey, M., Esedoglu, S. (2018). Threshold dynamics for
   anisotropic surface energies. Math. Comp. (doi:10.1090/mcom/3268).
43. Elsey, M., Esedoglu, S., Smereka, P. (2009). Diffusion generated motion for grain
   growth in two and three dimensions. J. Comput. Phys. 228(21), 8015-8033. Confirmed
   (UCLA CAM 09-39; SIAM News reference list). Signed distance per grain; one function
   can represent many grains; hundreds of thousands of grains.
44. Edelsbrunner, H. (1999). Deformable smooth surface design. Discrete Comput. Geom.
   21(1), 87-115. doi:10.1007/PL00009412. Confirmed: https://link.springer.com/article/10.1007/PL00009412 .
   Weighted points define a C1 "skin" surface of sphere and hyperboloid patches.
45. Ishii, H., Pires, G. E., Souganidis, P. E. (1999). Threshold dynamics type
   approximation schemes for propagating fronts. J. Math. Soc. Japan 51(2), 267-308.
   Laux, T., Otto, F. (2016). Convergence of the thresholding scheme for multi-phase
   mean-curvature flow. Calc. Var. PDE 55(5), 129. Both confirmed from the Swartz & Yip
   bibliography (refs [23], [25]).
46. Weaire, D., Phelan, R. (1994). A counter-example to Kelvin's conjecture on minimal
   surfaces. Philosophical Magazine Letters 69, 107-110. Confirmed from the auction
   dynamics bibliography (ref [46]) and TCD history page.
47. Plateau, J. (1873). Statique experimentale et theorique des liquides soumis aux
   seules forces moleculaires. Paris: Gauthier-Villars (2 vols). Confirmed: Nature review
   doi:10.1038/010119a0; scans at https://facstaff.susqu.edu/b/brakke/PlateauBook/Plateau-Fr.pdf .
48. Young, T. (1805). An essay on the cohesion of fluids. Phil. Trans. R. Soc. Lond. 95,
   65-87. doi:10.1098/rstl.1805.0005. Confirmed (search). Laplace, P.-S. (1805/1806),
   supplement to Book 10 of Traite de mecanique celeste (theorie de l'action capillaire);
   date varies by source.
49. Weaire, D., Rivier, N. (1984). Soap, cells and statistics - random patterns in two
   dimensions. Contemporary Physics 25(1), 59-99. doi:10.1080/00107518408210979.
   Confirmed (search). T1 = neighbour swap, T2 = cell disappearance (definitions confirmed
   from later papers, not from this text).
50. Glassner, A. (2000). Soap bubbles: part 2. IEEE Computer Graphics and Applications
   20(6) (Nov. 2000). Confirmed: https://www.glassner.com/wp-content/uploads/2014/04/CG-CGA-PDF-00-11-Soap-Bubbles-2-Nov00.pdf
   (thin-film interference colours, cluster geometry).
51. Game precedents (web sources, not peer reviewed):
   - Townscaper (O. Stalberg, 2020): marching-cubes-like placement of corner modules on an
     irregular quad grid; https://www.gamedeveloper.com/game-platforms/how-townscaper-works-a-story-four-games-in-the-making
     (T. Thompson, 2022-04-06) and IndieCade Europe 2019 talk "Organic Towns from Square Tiles"
     (Wikipedia). Module count/lookup not confirmed.
   - NoCubes (Minecraft mod, Cadiboo): turns terrain rounded, leaves builds untouched;
     https://modrinth.com/mod/nocubes . Algorithm not confirmed from these pages (the repo's
     PLAN.md section 7 calls it "NoCubes-style naive surface nets").
   - Claybook (Second Order, 2018): GPU clay simulation on signed distance fields; GDC 2018
     talk by S. Aaltonen, https://www.gdcvault.com/play/1025316/Advanced-Graphics-Techniques-Tutorial-GPU .
   - Lysenko, M. (2012). Smooth voxel terrain (part 2), 0fps.net; JS code in
     https://github.com/mikolalysenko/isosurface (surfaceNets). Post text not read.
52. Searched and NOT found: any paper documenting that an axis-aligned four-phase cross is
   a fixed point of Gaussian threshold dynamics (query logged 2026-10-21). The derivation
   in REPORT.md is this team's own.
53. Morgan, F. (1994). Soap bubbles in R^2 and in surfaces. Pacific J. Math. 165(2),
   347-361. MR1300837. Confirmed: https://msp.org/pjm/1994/165-2/p07.xhtml . Abstract:
   minimizing planar clusters "consist of constant-curvature arcs meeting in threes at
   120 degrees" (the 2D analogue of Taylor 1976: no four-way points).
54. Paolini, E., Tamagnini, A. (2018). Minimal clusters of four planar regions with the
   same area. ESAIM: COCV 24(3), 1303-1331. doi:10.1051/cocv/2017066; arXiv:1612.00178.
   Confirmed: https://www.numdam.org/item/COCV_2018__24_3_1303_0 . The optimal 4-cluster
   of equal areas has all regions connected and a uniquely determined topology (the
   abstract does not describe the topology; not read further).
55. Esedoglu & Otto (2015), kernel conditions (read in the MiS preprint, sec. 5.2,
   eq. (49)): stability needs only G(x) >= 0 and Fourier transform G^(xi) >= 0, so that
   G = g * g; radial symmetry is used for the convergence (Gamma-limit) part.
