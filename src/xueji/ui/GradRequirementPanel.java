package xueji.ui;

import java.awt.BorderLayout;
import java.awt.FlowLayout;
import java.util.List;

import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JTable;
import javax.swing.table.DefaultTableModel;

import xueji.dao.DepartmentDao;
import xueji.dao.GraduationRequirementDao;
import xueji.entity.Department;
import xueji.entity.GraduationRequirement;

/**
 * 毕业学分要求管理面板。
 *
 * <p>每个系一条记录，主键为系号，可修改的只有"毕业所需总学分"。
 * 因为主键不可改、且新增时需从已有系中选择，故不使用通用
 * {@link CrudPanel}，而单独实现更贴合业务的操作。</p>
 */
public class GradRequirementPanel extends JPanel {

    private static final long serialVersionUID = 1L;

    private final GraduationRequirementDao requirementDao = new GraduationRequirementDao();
    private final DepartmentDao departmentDao = new DepartmentDao();

    private final DefaultTableModel model;
    private final JTable table;

    /**
     * 构造毕业要求管理面板。
     */
    public GradRequirementPanel() {
        setLayout(new BorderLayout());
        model = new DefaultTableModel(
                new String[]{"系号", "系名", "毕业所需学分"}, 0) {
            private static final long serialVersionUID = 1L;

            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
        table = new JTable(model);

        add(buildToolbar(), BorderLayout.NORTH);
        add(new JScrollPane(table), BorderLayout.CENTER);
        refresh();
    }

    /** 顶部工具栏：新增 / 修改学分 / 删除 / 刷新。 */
    private JPanel buildToolbar() {
        JButton addBtn = new JButton("新增");
        JButton editBtn = new JButton("修改学分");
        JButton delBtn = new JButton("删除");
        JButton refBtn = new JButton("刷新");

        addBtn.addActionListener(e -> doAdd());
        editBtn.addActionListener(e -> doEdit());
        delBtn.addActionListener(e -> doDelete());
        refBtn.addActionListener(e -> refresh());

        JPanel bar = new JPanel(new FlowLayout(FlowLayout.LEFT));
        bar.add(addBtn);
        bar.add(editBtn);
        bar.add(delBtn);
        bar.add(refBtn);
        bar.setBorder(BorderFactory.createEmptyBorder(2, 2, 2, 2));
        return bar;
    }

    /** 刷新表格。 */
    public void refresh() {
        model.setRowCount(0);
        for (Object[] row : requirementDao.findAllWithDeptName()) {
            model.addRow(row);
        }
    }

    /** 新增：选择系并填写毕业学分。 */
    private void doAdd() {
        List<Department> depts = departmentDao.findAll();
        if (depts.isEmpty()) {
            JOptionPane.showMessageDialog(this, "请先录入系信息。");
            return;
        }
        JComboBox<Department> deptBox = new JComboBox<>(depts.toArray(new Department[0]));
        javax.swing.JTextField creditField = new javax.swing.JTextField(10);
        JPanel form = new JPanel(new java.awt.GridLayout(2, 2, 6, 6));
        form.add(new JLabel("系："));
        form.add(deptBox);
        form.add(new JLabel("毕业所需学分："));
        form.add(creditField);

        int ok = JOptionPane.showConfirmDialog(this, form, "新增毕业要求",
                JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
        if (ok != JOptionPane.OK_OPTION) {
            return;
        }
        Department d = (Department) deptBox.getSelectedItem();
        if (d == null) {
            return;
        }
        try {
            int credit = parseCredit(creditField.getText());
            requirementDao.insert(new GraduationRequirement(d.getDeptId(), credit));
            refresh();
            JOptionPane.showMessageDialog(this, "新增成功。");
        } catch (RuntimeException e) {
            JOptionPane.showMessageDialog(this, e.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 修改选中系的毕业学分。 */
    private void doEdit() {
        int r = table.getSelectedRow();
        if (r < 0) {
            JOptionPane.showMessageDialog(this, "请先在表格中选择一条记录。");
            return;
        }
        int real = table.convertRowIndexToModel(r);
        String deptId = String.valueOf(model.getValueAt(real, 0));
        String deptName = String.valueOf(model.getValueAt(real, 1));
        String oldCredit = String.valueOf(model.getValueAt(real, 2));

        String input = JOptionPane.showInputDialog(this,
                "请为「" + deptName + "」输入新的毕业所需学分：", oldCredit);
        if (input == null) {
            return;
        }
        try {
            int credit = parseCredit(input);
            requirementDao.update(new GraduationRequirement(deptId, credit));
            refresh();
            JOptionPane.showMessageDialog(this, "修改成功。");
        } catch (RuntimeException e) {
            JOptionPane.showMessageDialog(this, e.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 删除选中系的毕业要求。 */
    private void doDelete() {
        int r = table.getSelectedRow();
        if (r < 0) {
            JOptionPane.showMessageDialog(this, "请先在表格中选择一条记录。");
            return;
        }
        int real = table.convertRowIndexToModel(r);
        String deptId = String.valueOf(model.getValueAt(real, 0));
        int confirm = JOptionPane.showConfirmDialog(this,
                "确定删除该系的毕业要求吗？", "确认", JOptionPane.YES_NO_OPTION);
        if (confirm != JOptionPane.YES_OPTION) {
            return;
        }
        try {
            requirementDao.delete(deptId);
            refresh();
            JOptionPane.showMessageDialog(this, "删除成功。");
        } catch (RuntimeException e) {
            JOptionPane.showMessageDialog(this, e.getMessage(), "失败",
                    JOptionPane.ERROR_MESSAGE);
        }
    }

    /** 解析并校验学分输入（非负整数）。 */
    private int parseCredit(String s) {
        try {
            int v = Integer.parseInt(s.trim());
            if (v < 0) {
                throw new NumberFormatException();
            }
            return v;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("学分必须是非负整数。");
        }
    }
}
